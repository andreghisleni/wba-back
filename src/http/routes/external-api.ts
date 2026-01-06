/** biome-ignore-all lint/suspicious/noConsole: <explanation> */
import { Elysia, t } from 'elysia';
import { metaErrorsQueue } from '~/queue/setup';
import { parseTemplateBody } from '~/scripts/parse-template-body';
import { upsertSmartContact } from '~/services/contact-service';
import { webhookService } from '~/services/webhook-service';
import { prisma } from '../../db/client';
import { apiKeyMacro } from '../macros/api-key';
import { TemplateResponseSchema } from './whatsapp/templates';

// Schema para os botões (Baseado no seu chat.ts mas expandido para quick_reply)
const ButtonParamSchema = t.Object({
  index: t.Number(),
  type: t.Union([t.Literal('url'), t.Literal('quick_reply')]),
  value: t.String({ description: 'Sufixo da URL ou Payload do botão' }),
});

export const externalApiRoutes = new Elysia({ prefix: '/v1' })
  .use(apiKeyMacro) // Carrega a macro
  .guard({ apiKeyAuth: true }) // Protege TODAS as rotas abaixo com a chave

  // 1. Rota de Teste (Ping)
  .get(
    '/status',
    ({ organization }) => {
      return {
        status: 'ok',
        message: `Conexão estabelecida com sucesso para: ${organization.name}`,
        timestamp: new Date().toISOString(),
      };
    },
    {
      detail: {
        summary: 'Testar conexão da API Key',
        tags: ['External API'],
      },
      response: {
        200: t.Object({
          status: t.String(),
          message: t.String(),
          timestamp: t.String(),
        }),
      },
    }
  )
  // Rota de Envio de Template (Baseada no chat.ts)
  .post(
    '/messages',
    async ({ body, organization, set }) => {
      // 1. Validar Instância Ativa
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { organizationId: organization.id, status: 'ACTIVE' },
      });

      if (!instance) {
        set.status = 400;
        return { error: 'Instância desconectada ou não encontrada.' };
      }

      // 2. Buscar Template no Banco (NECESSÁRIO para pegar o texto cru, ID e headerMediaUrl)
      const storedTemplate = await prisma.template.findFirst({
        where: {
          instanceId: instance.id,
          name: body.template,
          status: 'APPROVED',
        },
        select: { id: true, body: true, structure: true, headerMediaUrl: true },
      });

      if (!storedTemplate) {
        set.status = 404;
        return { error: 'Template não encontrado ou não aprovado na Meta.' };
      }

      // 2. BUSCAR OU CRIAR O CONTATO (A lógica crucial do chat.ts adaptada)
      // O sistema externo manda o numero ("to"), nós precisamos do ID para salvar no banco.
      const contact = await upsertSmartContact({
        instanceId: instance.id,
        phoneNumber: body.to.number, // O número que a API externa enviou
        name: body.to.name || body.to.number, // Usa o nome se disponível, senão o número
        replaceName: body.to.saveNameIfNotExists ?? false, // Salvar nome se não existir
      });

      // 3. Montar Payload da Meta (Estritamente Template)
      // biome-ignore lint/suspicious/noExplicitAny: payloads dinâmicos da Meta API
      const components: any[] = [];

      // A. Verifica se tem HEADER de vídeo e usa headerMediaUrl do banco
      if (
        storedTemplate?.structure &&
        Array.isArray(storedTemplate.structure)
      ) {
        const headerComponent = (
          storedTemplate.structure as { type: string; format: string }[]
        ).find((c) => c.type === 'HEADER' && c.format === 'VIDEO');

        // Se tem header de vídeo E temos uma URL configurada, adiciona ao payload
        if (headerComponent && storedTemplate.headerMediaUrl) {
          components.push({
            type: 'header',
            parameters: [
              {
                type: 'video',
                video: { link: storedTemplate.headerMediaUrl },
              },
            ],
          });
        }
      }

      // B. Variáveis de Texto (Body)
      if (body.variables && body.variables.length > 0) {
        components.push({
          type: 'body',
          parameters: body.variables.map((val) => ({
            type: 'text',
            text: val,
          })),
        });
      }

      // C. Variáveis de Botão (Buttons)
      if (body.buttons && body.buttons.length > 0) {
        for (const btn of body.buttons) {
          if (btn.type === 'url') {
            components.push({
              type: 'button',
              sub_type: 'url',
              index: btn.index,
              parameters: [{ type: 'text', text: btn.value }],
            });
          } else if (btn.type === 'quick_reply') {
            components.push({
              type: 'button',
              sub_type: 'quick_reply',
              index: btn.index,
              parameters: [{ type: 'payload', payload: btn.value }],
            });
          }
        }
      }

      const metaPayload = {
        messaging_product: 'whatsapp',
        to: contact.waId,
        type: 'template',
        template: {
          name: body.template,
          language: { code: body.language || 'pt_BR' },
          components: components.length > 0 ? components : undefined,
        },
      };

      try {
        // 4. Envio para a Meta (Igual ao chat.ts)
        const url = `https://graph.facebook.com/v21.0/${instance.phoneNumberId}/messages`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${instance.accessToken}`,
          },
          body: JSON.stringify(metaPayload),
        });

        const responseData = await res.json();

        if (!res.ok || responseData.error) {
          throw new Error(
            responseData.error?.message || 'Erro desconhecido na Meta'
          );
        }

        // 6. PREPARAR O TEXTO PARA SALVAR (A MUDANÇA ESTÁ AQUI)
        let bodyToSave = `Template: ${body.template}`; // Fallback padrão

        if (storedTemplate?.body) {
          // Se temos o template no banco, interpolamos as variáveis
          bodyToSave = parseTemplateBody(storedTemplate.body, body.variables);

          // (Opcional) Se quiser adicionar info dos botões no texto, mas o usuário pediu só o final
          // bodyToSave += ...

          bodyToSave += `\n\n Botões:\n ${body.buttons
            ?.map(
              (b) =>
                `- [${b.type === 'url' ? 'URL' : 'Quick Reply'}] ${b.value}`
            )
            .join('\n')}`;

          bodyToSave += '\n\n [Enviado via api externa]'; // Marcação extra
        } else if (body.variables && body.variables.length > 0) {
          bodyToSave += ` (${body.variables.join(', ')})`;
        }

        // 7. Preparar templateParams para salvar (renderização no frontend)
        const templateParams = {
          templateId: storedTemplate.id,
          templateName: body.template,
          language: body.language || 'pt_BR',
          bodyParams: body.variables,
          buttonParams: body.buttons?.map((btn) => ({
            index: btn.index,
            value: btn.value,
          })),
        };

        // 8. Persistência
        const savedMsg = await prisma.message.create({
          data: {
            wamid: responseData.messages[0].id,
            contactId: contact.id,
            instanceId: instance.id,
            direction: 'OUTBOUND',
            type: 'template',
            status: 'SENT',
            body: bodyToSave, // <--- Texto completo formatado
            timestamp: BigInt(Math.floor(Date.now() / 1000)),
            templateParams, // <--- Parâmetros do template para renderização
          },
        });

        // Atualiza o contato para subir na lista de conversas recentes
        await prisma.contact.update({
          where: { id: contact.id },
          data: { updatedAt: new Date() },
        });

        webhookService.dispatch(organization.id, 'message.sent', {
          to: body.to,
          template: body.template,
          wamid: savedMsg.wamid,
          status: 'queued',
        });

        return {
          success: true,
          messageId: savedMsg.wamid,
          status: 'queued',
        };

        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      } catch (error: any) {
        console.error('[External API Error]', error);
        set.status = 500;
        return {
          error: 'Falha no envio',
          details: error.message,
        };
      }
    },
    {
      // Validação de Entrada
      body: t.Object({
        to: t.Object(
          {
            number: t.String({
              description: 'Número de telefone (ex: 554899998888)',
            }),
            name: t.Optional(t.String({ description: 'Nome do contato' })),
            saveNameIfNotExists: t.Optional(
              t.Boolean({
                default: false,
                description: 'Salvar nome se não existir',
              })
            ),
          },
          { description: 'Informações do contato destinatário' }
        ),
        template: t.String({ description: 'Nome do template na Meta' }),
        language: t.Optional(t.String({ default: 'pt_BR' })),

        // Flattened params (mais fácil para API externa usar)
        variables: t.Optional(t.Array(t.String())), // Array simples de strings
        buttons: t.Optional(t.Array(ButtonParamSchema)),
      }),
      detail: {
        tags: ['External API'],
        summary: 'Dispara template e registra no chat',
      },
    }
  )
  // 2. Importação/Atualização em Massa (Versão Otimizada)
  .post(
    '/contacts',
    async ({ body, organization, set }) => {
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { organizationId: organization.id, status: 'ACTIVE' },
      });

      if (!instance) {
        set.status = 400;
        return { error: 'Nenhuma instância do WhatsApp conectada.' };
      }

      // 1. Pré-filtro: Limpa e valida apenas os números úteis
      const validInputs = body
        .map((item) => ({
          name: item.name,
          originalNumber: item.number,
          cleanNumber: item.number.replace(/\D/g, ''),
        }))
        .filter((item) => item.cleanNumber.length >= 10);

      // 2. Processamento Paralelo com Promise.all
      // O .map dispara as promessas, o Promise.all espera todas resolverem
      const results = await Promise.allSettled(
        validInputs.map((item) =>
          upsertSmartContact({
            instanceId: instance.id,
            phoneNumber: item.cleanNumber,
            name: item.name || item.cleanNumber,
            replaceName: !!item.name,
          })
        )
      );

      // 3. Contabiliza sucessos e erros
      const processed = results.filter((r) => r.status === 'fulfilled').length;
      const errors = results.filter((r) => r.status === 'rejected').length;

      return {
        success: true,
        message: 'Processamento finalizado.',
        details: {
          totalReceived: body.length,
          validFormat: validInputs.length,
          savedUpdated: processed,
          failed: errors,
        },
      };
    },
    {
      body: t.Array(
        t.Object({
          number: t.String(),
          name: t.String(),
        })
      ),
      detail: { tags: ['External API'] },
    }
  )
  .get(
    '/templates',
    async ({ organization }) => {
      const templates = await prisma.template.findMany({
        where: { instance: { organizationId: organization.id } },
        orderBy: { createdAt: 'desc' },
      });

      // Cast necessário pois Prisma Json é incompatível com TypeBox estrito
      return templates as unknown as (typeof TemplateResponseSchema.static)[];
    },
    {
      response: t.Array(TemplateResponseSchema),
      detail: {
        tags: ['External API'],
      },
    }
  ) // ROTA: Reprocessar Mensagens com Erro (Backfill)
  .post(
    '/reprocess-messages',
    async ({ query }) => {
      console.log('🔄 Buscando mensagens com erro não processadas...');

      // 1. Busca mensagens que têm erro mas não têm a definição vinculada
      // Limitamos a 1000 por vez para não estourar a memória se tiver milhões
      const limit = query.limit ? Number(query.limit) : 1000;

      const messagesToProcess = await prisma.message.findMany({
        where: {
          errorCode: { not: null }, // Tem código de erro
          errorDefinitionId: null, // Ainda não foi vinculada (não processada)
          // Opcional: filtrar apenas status FAILED se sua lógica exigir
          // status: 'FAILED'
        },
        take: limit,
        select: {
          id: true,
          errorCode: true,
          errorDesc: true,
        },
      });

      if (messagesToProcess.length === 0) {
        return {
          success: true,
          message: 'Nenhuma mensagem pendente de processamento de erro.',
          count: 0,
        };
      }

      // 2. Prepara jobs no formato exato que seu worker espera
      const jobs = messagesToProcess.map((msg) => ({
        name: 'process-legacy-error', // Nome descritivo (o worker aceita qualquer nome)
        data: {
          messageId: msg.id,
          errorCode: msg.errorCode,
          errorDesc: msg.errorDesc,
        },
        opts: {
          jobId: `msg-err-${msg.id}`, // Garante que a mesma mensagem não entre 2x na fila
          removeOnComplete: true,
          attempts: 3,
        },
      }));

      // 3. Envia para a fila 'whatsapp-error-processing'
      await metaErrorsQueue.addBulk(jobs);

      console.log(`✅ ${jobs.length} mensagens enviadas para a fila de erros.`);

      return {
        success: true,
        message: 'Backfill iniciado.',
        enqueued_count: jobs.length,
        next_step:
          'Rode novamente se houver mais registros (paginação manual).',
      };
    },
    {
      detail: {
        tags: ['External API'],
        summary: 'Enfileira mensagens antigas para o worker de erros',
      },
    }
  );
