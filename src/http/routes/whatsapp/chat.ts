/** biome-ignore-all lint/style/useBlockStatements: necessário para compatibilidade */
/** biome-ignore-all lint/suspicious/noConsole: logs de debug */
/** biome-ignore-all lint/suspicious/noExplicitAny: payloads dinâmicos da Meta API */
import type { InputJsonValue } from '@prisma/client/runtime/client';
import { Elysia, t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';
import { upsertSmartContact } from '~/services/contact-service';

const TemplateParamsSchema = t.Object({
  name: t.String(),
  language: t.String({ default: 'pt_BR' }),
  // Valores para as variáveis do corpo: {{1}}, {{2}} -> ["João", "R$ 50,00"]
  bodyValues: t.Optional(t.Array(t.String())),
  // Valores para variáveis de botão (se houver URL dinâmica)
  buttonValues: t.Optional(
    t.Array(
      t.Object({
        index: t.Number(), // Qual botão é (0, 1, 2)
        value: t.String(), // O valor da variável na URL
      })
    )
  ),
});

const ContactListItemSchema = t.Object({
  id: t.String(),
  pushName: t.String(),
  waId: t.String(),
  profilePicUrl: t.Nullable(t.String()),
  unreadCount: t.Number(),
  lastMessage: t.String(),
  lastMessageType: t.String(),
  lastMessageStatus: t.Optional(t.String()),
  lastMessageAt: t.Date(),
  isWindowOpen: t.Boolean(),
});

// Schema para os parâmetros do template salvos
const TemplateParamsStoredSchema = t.Object({
  templateId: t.String(),
  templateName: t.String(),
  language: t.String(),
  headerParams: t.Optional(
    t.Object({
      type: t.String(),
      values: t.Optional(t.Array(t.String())),
    })
  ),
  bodyParams: t.Optional(t.Array(t.String())),
  buttonParams: t.Optional(
    t.Array(
      t.Object({
        index: t.Number(),
        value: t.String(),
      })
    )
  ),
});

const MessageItemSchema = t.Object({
  id: t.String(),
  body: t.Nullable(t.String()),
  type: t.String(),
  mediaUrl: t.Nullable(t.String()),
  mediaFileName: t.Nullable(t.String()),
  direction: t.String(),
  status: t.String(),
  timestamp: t.Date(),
  errorCode: t.Nullable(t.String()),
  errorDesc: t.Nullable(t.String()),
  errorDefinition: t.Optional(t.Nullable(t.Object({
    id: t.String(),
    metaCode: t.String(),
    shortExplanation: t.Nullable(t.String()),
    detailedExplanation: t.Nullable(t.String()),
  }))),
  // Novos campos para templates
  templateParams: t.Optional(t.Nullable(TemplateParamsStoredSchema)),
});

const SendMessageResponseSchema = t.Object({
  id: t.String(),
  wamid: t.String(),
  type: t.String(),
  direction: t.String(),
  status: t.String(),
  body: t.Nullable(t.String()),
  mediaUrl: t.Nullable(t.String()),
  mediaMimeType: t.Nullable(t.String()),
  mediaCaption: t.Nullable(t.String()),
  mediaFileName: t.Nullable(t.String()),
  contactId: t.String(),
  instanceId: t.String(),
  createdAt: t.Date(),
  timestamp: t.Date(),
  processingStatus: t.String(),
  errorCode: t.Nullable(t.String()),
  errorDesc: t.Nullable(t.String()),
  templateParams: t.Optional(t.Nullable(TemplateParamsStoredSchema)),
});

const CreateContactResponseSchema = t.Object({
  id: t.String(),
  waId: t.String(),
  pushName: t.Nullable(t.String()),
  profilePicUrl: t.Nullable(t.String()),
  instanceId: t.String(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

const ReadMessagesResponseSchema = t.Object({
  success: t.Boolean(),
  readCount: t.Number(),
});

const ErrorResponseSchema = t.Object({
  error: t.String(),
});

export const whatsappChatRoute = new Elysia()
  .macro(authMacro)
  // 1. Listar Contatos (Inbox)
  .get(
    '/contacts',
    async ({ organizationId }) => {
      // 24 horas em milissegundos
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

      const contacts = await prisma.contact.findMany({
        where: {
          instance: { organizationId },
        },
        // Aqui está o segredo: Selecionamos os campos específicos + ultimas mensagens
        select: {
          id: true,
          pushName: true,
          waId: true,
          profilePicUrl: true,
          updatedAt: true,
          // NOVO: Conta mensagens INBOUND que ainda estão como DELIVERED
          _count: {
            select: {
              messages: {
                where: {
                  direction: 'INBOUND',
                  status: 'DELIVERED' // Consideramos DELIVERED como "Não Lida" para quem recebe
                }
              }
            }
          },
          messages: {
            orderBy: { timestamp: 'desc' },
            take: 50, // Garante que achamos a última dele mesmo se você mandou muitas
            select: {
              // Trazemos APENAS o necessário para o cálculo
              body: true,      // Precisamos do body só da primeira (para o preview)
              timestamp: true,
              direction: true,
              status: true,
              type: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' },
      });
      // Processamento em Memória (Super rápido)
      return contacts.map(c => {
        // 1. Para o PREVIEW e ORDENAÇÃO: Usamos a última mensagem absoluta (seja sua ou dele)
        const lastMsgAbsolute = c.messages[0];

        // 2. Para a JANELA DE 24H: Procuramos a última mensagem que O CLIENTE mandou (INBOUND)
        // O .find() percorre o array (que tem as últimas 10 ou 50 msgs) e para na primeira que achar.
        const lastInboundMsg = c.messages.find(m => m.direction === 'INBOUND');

        // 3. Cálculo da Janela
        let isWindowOpen = false;
        if (lastInboundMsg) {
          const lastInboundTime = Number(lastInboundMsg.timestamp) * 1000;
          const diff = Date.now() - lastInboundTime;
          isWindowOpen = diff < TWENTY_FOUR_HOURS;
        }
        // Se não achou nenhuma inbound recente no histórico buscado, assume fechada.

        return {
          id: c.id,
          pushName: c.pushName || c.waId,
          waId: c.waId,
          profilePicUrl: c.profilePicUrl,

          // Contador de Não Lidas (Bolinha Vermelha)
          unreadCount: c._count.messages,

          // Texto cinza do preview (pode ser "Oi" dele ou "Tudo bem?" seu)
          lastMessage: lastMsgAbsolute?.body || "",

          // Status (para mostrar o check/double-check se a última for sua)
          lastMessageStatus: lastMsgAbsolute?.status,

          lastMessageType: lastMsgAbsolute?.type || "text",

          // Data para ordenar a lista (A última interação real)
          lastMessageAt: lastMsgAbsolute
            ? new Date(Number(lastMsgAbsolute.timestamp) * 1000)
            : c.updatedAt,

          // Flag para habilitar/desabilitar o input de texto no front
          isWindowOpen
        };
      });
    },
    {
      auth: true,
      detail: {
        operationId: 'getWhatsappContacts', // <--- Isso define o nome do hook
        tags: ['WhatsApp'],
      },
      response: {
        200: t.Array(ContactListItemSchema),
      },
    }
  )

  // 2. Listar Mensagens de um Contato
  .get(
    '/contacts/:contactId/messages',
    async ({ params, organizationId, set }) => {
      // Verifica se o contato pertence a uma instância do usuário (Segurança)
      const contact = await prisma.contact.findFirst({
        where: {
          id: params.contactId,
          instance: { organizationId },
        },
      });

      if (!contact) {
        set.status = 404;
        return { error: 'Contato não encontrado ou sem permissão' };
      }

      const messages = await prisma.message.findMany({
        where: { contactId: params.contactId },
        orderBy: { timestamp: 'asc' },
        include: {
          errorDefinition: true,
        }
      });

      return messages.map((m) => ({
        id: m.id,
        body: m.body, // Se for imagem, aqui pode ser a legenda
        type: m.type, // 'text', 'image', 'video', etc.
        mediaUrl: m.mediaUrl, // URL da imagem
        mediaFileName: m.mediaFileName,
        direction: m.direction,
        status: m.status,
        timestamp: new Date(Number(m.timestamp) * 1000),
        // Parâmetros do template (se for mensagem de template)
        templateParams: (m as unknown as { templateParams: typeof TemplateParamsStoredSchema.static | null }).templateParams,
        errorCode: m.errorCode,
        errorDesc: m.errorDesc,
        errorDefinition: m.errorDefinition ? {
          id: m.errorDefinition.id,
          metaCode: m.errorDefinition.metaCode,
          shortExplanation: m.errorDefinition.shortExplanation,
          detailedExplanation: m.errorDefinition.detailedExplanation,
        } : undefined,
      }));
    },
    {
      auth: true,
      params: t.Object({ contactId: t.String() }),
      detail: {
        operationId: 'getWhatsappContactsContactIdMessages',
        tags: ['WhatsApp'],
      },
      response: {
        200: t.Array(MessageItemSchema),
        404: ErrorResponseSchema,
      },
    }
  )

  // 3. Enviar Mensagem (Simples texto)
  .post(
    '/messages',
    async ({ body, organizationId, set }) => {
      const { contactId, type, message: textMessage, template } = body;

      // 1. Busca dados do contato e instância
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        include: { instance: true },
      });

      if (!contact || contact.instance.organizationId !== organizationId) {
        set.status = 403;
        return { error: 'Sem permissão' };
      }

      const metaPayload: any = {
        messaging_product: 'whatsapp',
        to: contact.waId,
      };

      // Variável para armazenar o template buscado (usado depois para salvar params)
      let storedTemplate: any = null;

      // --- LÓGICA DE MONTAGEM DO PAYLOAD ---

      if (type === 'text') {
        if (!textMessage) throw new Error('Mensagem de texto vazia');
        metaPayload.type = 'text';
        metaPayload.text = { body: textMessage };
      } else if (type === 'template') {
        if (!template) throw new Error('Dados do template faltando');

        // Busca o template no banco para verificar se tem header de vídeo
        storedTemplate = await prisma.template.findFirst({
          where: {
            name: template.name,
            language: template.language || 'pt_BR',
            instanceId: contact.instanceId,
          },
          select: {
            id: true,
            structure: true,
            headerMediaUrl: true,
          },
        });

        const components: any[] = [];

        // A. Verifica se tem HEADER de vídeo e usa headerMediaUrl do banco
        if (storedTemplate?.structure && Array.isArray(storedTemplate.structure)) {
          const headerComponent = (storedTemplate.structure as any[]).find(
            (c: any) => c.type === 'HEADER' && c.format === 'VIDEO'
          );

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

        // B. Preenche variáveis do CORPO (Body)
        if (template.bodyValues && template.bodyValues.length > 0) {
          components.push({
            type: 'body',
            parameters: template.bodyValues.map((val: any) => ({
              type: 'text',
              text: val,
            })),
          });
        }

        // C. Preenche variáveis de BOTÕES (Buttons)
        if (template.buttonValues && template.buttonValues.length > 0) {
          for (const btn of template.buttonValues) {
            components.push({
              type: 'button',
              sub_type: 'url',
              index: btn.index,
              parameters: [
                {
                  type: 'text',
                  text: btn.value,
                },
              ],
            });
          }
        }

        metaPayload.type = 'template';
        metaPayload.template = {
          name: template.name,
          language: { code: template.language || 'pt_BR' },
          components: components.length > 0 ? components : undefined,
        };
      }

      try {
        // 2. Envia para a Meta
        const url = `https://graph.facebook.com/v21.0/${contact.instance.phoneNumberId}/messages`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${contact.instance.accessToken}`,
          },
          body: JSON.stringify(metaPayload),
        });

        const responseData = await res.json();
        if (responseData.error) throw new Error(responseData.error.message);

        // 3. Salva no Banco
        // Se for template, salvamos algo legível no body, ex: "Template: nome_do_template"
        const bodyToSave =
          type === 'text' ? textMessage : `Template: ${template?.name}`;

        // Se for template, usa os dados do template já buscado para salvar os parâmetros
        let templateParamsToSave: InputJsonValue | null = null;
        if (type === 'template' && template && storedTemplate) {
          templateParamsToSave = {
            templateId: storedTemplate.id,
            templateName: template.name,
            language: template.language || 'pt_BR',
            bodyParams: template.bodyValues || [],
            buttonParams: template.buttonValues || [],
          };
        }

        const savedMsg = await prisma.message.create({
          data: {
            wamid: responseData.messages[0].id,
            contactId: contact.id,
            instanceId: contact.instanceId,
            direction: 'OUTBOUND',
            body: bodyToSave, // O texto ou o nome do template
            type: type === 'template' ? 'template' : 'text', // Importante ter essa coluna no DB se quiser diferenciar
            status: 'SENT',
            timestamp: BigInt(Math.floor(Date.now() / 1000)),
            // @ts-expect-error - campo será adicionado na próxima migration
            templateParams: templateParamsToSave,
          },
        });

        // Update contact updatedAt... (seu código existente)
        await prisma.contact.update({
          where: { id: contact.id },
          data: { updatedAt: new Date() },
        });

        return {
          ...savedMsg,
          timestamp: new Date(Number(savedMsg.timestamp) * 1000),
          templateParams: templateParamsToSave as typeof TemplateParamsStoredSchema.static | null,
        };
      } catch (error: any) {
        set.status = 500;
        return { error: error.message };
      }
    },
    {
      auth: true,
      body: t.Object({
        contactId: t.String(),
        type: t.Enum({ text: 'text', template: 'template' }),
        message: t.Optional(t.String()),
        template: t.Optional(TemplateParamsSchema),
      }),
      response: {
        200: SendMessageResponseSchema,
        403: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    }
  )
  .post(
    '/contacts',
    async ({ body, organizationId, set }) => {
      const { phoneNumber, name } = body;

      // 1. Valida e seleciona a instância
      // Se o front não mandar instanceId, tentamos pegar a primeira conectada do usuário
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { organizationId },
      });

      if (!instance) {
        set.status = 400;
        return { error: 'Nenhuma instância disponível para criar o contato.' };
      }

      // 2. Limpeza do Telefone (Remove tudo que não é número)
      const cleanPhone = phoneNumber.replace(/\D/g, '');

      // Validar tamanho mínimo (DDI + DDD + Numero)
      if (cleanPhone.length < 10) {
        set.status = 400;
        return { error: 'Número de telefone inválido.' };
      }

      // 3. Upsert (Cria ou Atualiza se já existir)
      // 2. USA A NOVA FUNÇÃO DE UPSERT INTELIGENTE
      // Ela vai lidar com a variação do 9º dígito automaticamente
      const contact = await upsertSmartContact({
        instanceId: instance.id,
        phoneNumber: cleanPhone,
        name,
      });

      return contact;
    },
    {
      auth: true,
      body: t.Object({
        phoneNumber: t.String(),
        name: t.Optional(t.String()),
      }),
      detail: {
        tags: ['WhatsApp Contacts'],
        operationId: 'createWhatsappContact',
      },
      response: {
        200: CreateContactResponseSchema,
        400: ErrorResponseSchema,
      },
    }
  )
  // 4. Marcar Mensagens como Lidas (Visualizadas)
  .post("/contacts/:contactId/read", async ({ params, organizationId, set }) => {
    const { contactId } = params;

    // 1. Validação de Segurança
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        instance: { organizationId }
      },
      include: { instance: true } // Precisamos disso se quisermos avisar o WhatsApp (Opcional)
    });

    if (!contact) {
      set.status = 404;
      return { error: "Contato não encontrado." };
    }

    // 2. Atualiza no Banco de Dados
    // Muda tudo que é INBOUND + DELIVERED para READ
    const updateResult = await prisma.message.updateMany({
      where: {
        contactId,
        direction: 'INBOUND',
        status: 'DELIVERED'
      },
      data: {
        status: 'READ'
      }
    });

    // 3. (Opcional) Enviar "Blue Ticks" para o Cliente no WhatsApp
    // Isso faz aparecer os dois tracinhos azuis no celular da pessoa.
    // Se não quiser isso (modo "ninja"), basta comentar este bloco.
    if (updateResult.count > 0) {
      try {
        // Marcamos a ÚLTIMA mensagem como lida na API, o que implicitamente marca as anteriores
        const lastUnread = await prisma.message.findFirst({
          where: { contactId, direction: 'INBOUND', status: 'READ' }, // Já buscamos as que acabamos de atualizar
          orderBy: { timestamp: 'desc' }
        });

        if (lastUnread?.wamid) {
          const url = `https://graph.facebook.com/v21.0/${contact.instance.phoneNumberId}/messages`;
          await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${contact.instance.accessToken}`,
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              status: "read",
              message_id: lastUnread.wamid
            })
          });
        }
      } catch (error) {
        console.error("Erro ao enviar confirmação de leitura para Meta:", error);
        // Não falhamos a request por isso, é um efeito colateral
      }
    }

    return {
      success: true,
      readCount: updateResult.count
    };

  }, {
    auth: true,
    params: t.Object({ contactId: t.String() }),
    detail: {
      tags: ["WhatsApp"],
      summary: "Marca mensagens recebidas como lidas",
      operationId: "markWhatsappMessagesAsRead"
    },
    response: {
      200: ReadMessagesResponseSchema,
      404: ErrorResponseSchema,
    }
  })