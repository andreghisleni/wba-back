/** biome-ignore-all lint/style/useBlockStatements: <explanation> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
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
          messages: {
            orderBy: { timestamp: 'desc' },
            take: 20, // Trazemos as últimas 20. Geralmente é suficiente para achar a última do cliente.
            select: {
              body: true,
              timestamp: true,
              direction: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      // Processamento em Memória (Super rápido)
      return contacts.map((c) => {
        const lastMsg = c.messages[0]; // A mais recente (para preview)

        // Procura a primeira mensagem que seja INBOUND dentro do array que retornou
        const lastInbound = c.messages.find((m) => m.direction === 'INBOUND');

        // Cálculo da Janela
        let isWindowOpen = false;
        if (lastInbound) {
          const lastInboundTime = Number(lastInbound.timestamp) * 1000;
          isWindowOpen = Date.now() - lastInboundTime < TWENTY_FOUR_HOURS;
        }
        // OBS: Se não achou inbound nas últimas 20, assumimos false (fechada) por segurança.

        return {
          id: c.id,
          pushName: c.pushName || c.waId,
          waId: c.waId,
          profilePicUrl: c.profilePicUrl,
          // Dados para o Preview
          lastMessage: lastMsg?.body || '',
          lastMessageAt: lastMsg
            ? new Date(Number(lastMsg.timestamp) * 1000)
            : c.updatedAt,
          // Nossa flag calculada
          isWindowOpen,
        };
      });
    },
    {
      auth: true,
      detail: {
        operationId: 'getWhatsappContacts', // <--- Isso define o nome do hook
        tags: ['WhatsApp'],
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
      }));
    },
    {
      auth: true,
      params: t.Object({ contactId: t.String() }),
      detail: {
        operationId: 'getWhatsappContactsContactIdMessages',
        tags: ['WhatsApp'],
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

      // --- LÓGICA DE MONTAGEM DO PAYLOAD ---

      if (type === 'text') {
        if (!textMessage) throw new Error('Mensagem de texto vazia');
        metaPayload.type = 'text';
        metaPayload.text = { body: textMessage };
      } else if (type === 'template') {
        if (!template) throw new Error('Dados do template faltando');

        const components: any[] = [];

        // A. Preenche variáveis do CORPO (Body)
        if (template.bodyValues && template.bodyValues.length > 0) {
          components.push({
            type: 'body',
            parameters: template.bodyValues.map((val: any) => ({
              type: 'text',
              text: val,
            })),
          });
        }

        // B. Preenche variáveis de BOTÕES (Buttons)
        if (template.buttonValues && template.buttonValues.length > 0) {
          // biome-ignore lint/complexity/noForEach: <explanation>
          template.buttonValues.forEach((btn: any) => {
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
          });
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
    }
  );
