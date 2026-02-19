/** biome-ignore-all lint/style/useBlockStatements: necessário para compatibilidade */
/** biome-ignore-all lint/suspicious/noConsole: logs de debug */
/** biome-ignore-all lint/suspicious/noExplicitAny: payloads dinâmicos da Meta API */
import type { InputJsonValue } from '@prisma/client/runtime/client';
import { Elysia, t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';
import type { MessageType } from '~/db/generated/prisma/enums';
import { upsertSmartContact } from '~/services/contact-service';
import { socketService } from '~/services/socket-service';

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

  tag: t.Nullable(
    t.Object({
      id: t.String(),
      name: t.String(),
      color: t.String(),
      priority: t.Number(),
    })
  ),
});

// Schema para resposta paginada de contatos
const PaginatedContactsResponseSchema = t.Object({
  data: t.Array(ContactListItemSchema),
  meta: t.Object({
    total: t.Number(),
    page: t.Number(),
    limit: t.Number(),
    totalPages: t.Number(),
  }),
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
  errorDefinition: t.Optional(
    t.Nullable(
      t.Object({
        id: t.String(),
        metaCode: t.String(),
        shortExplanation: t.Nullable(t.String()),
        detailedExplanation: t.Nullable(t.String()),
      })
    )
  ),
  // Novos campos para templates
  templateParams: t.Optional(t.Nullable(TemplateParamsStoredSchema)),
  // Context de resposta (quando é reply a outra mensagem)
  replyContext: t.Optional(
    t.Nullable(
      t.Object({
        quotedMessageId: t.String(),
        quotedMessageBody: t.Nullable(t.String()),
        quotedMessageType: t.Nullable(t.String()),
      })
    )
  ),
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

interface ContactRaw {
  id: string;
  pushName: string | null;
  waId: string;
  profilePicUrl: string | null;
  contactUpdatedAt: Date;
  unreadCount: bigint;
  lastInboundTimestamp: bigint | null;
  // Campos extraídos do JSON
  lastMessageBody: string | null;
  lastMessageStatus: string | null;
  lastMessageType: string | null;
  lastMessageTimestamp: bigint | null;
  total_count: bigint;

  tagId: string | null;
  tagName: string | null;
  tagPriority: number | null;
  tagColor: string | null;
}

export const whatsappChatRoute = new Elysia()
  .macro(authMacro)
  // 1. Listar Contatos (Inbox) com Paginação e Filtros
  .get(
    '/contacts',
    async ({ organizationId, query }) => {
      // 1. Sanitização de Inputs
      const page = Math.max(1, query.page ?? 1);
      const limit = Math.max(1, Math.min(100, query.limit ?? 20));
      const offset = (page - 1) * limit;
      const searchParam = query.search?.trim();
      const search = searchParam ? `%${searchParam}%` : null;
      const unreadOnly = query.unreadOnly === 'true';

      // 2. Query SQL Otimizada (PostgreSQL)
      // Nota: Usamos as tabelas com "s" (contacts, messages) conforme o @@map do seu schema
      // 2. Query SQL Otimizada com Tags
      const contactsRaw = await prisma.$queryRaw<ContactRaw[]>`
        WITH ContactMetrics AS (
          SELECT
            c.id,
            -- Pega a última mensagem
            (
              SELECT json_build_object(
                'body', m.body, 
                'timestamp', m."timestamp",
                'status', m.status,
                'type', m.type
              )
              FROM messages m
              WHERE m."contactId" = c.id
              ORDER BY m."timestamp" DESC
              LIMIT 1
            ) as last_msg_obj,
            
            (
              SELECT COUNT(*)::int
              FROM messages m
              WHERE m."contactId" = c.id
              AND m.direction = 'INBOUND'
              AND m.status = 'DELIVERED'
            ) as unread_count,

            (
              SELECT m."timestamp"
              FROM messages m
              WHERE m."contactId" = c.id
              AND m.direction = 'INBOUND'
              ORDER BY m."timestamp" DESC
              LIMIT 1
            ) as last_inbound_ts

          FROM contacts c
          JOIN whatsapp_instances i ON c."instanceId" = i.id
          WHERE i."organizationId" = ${organizationId}
          AND (
            ${search}::text IS NULL OR 
            c."pushName" ILIKE ${search} OR 
            c."waId" ILIKE ${search}
          )
        )
        SELECT 
          c.id,
          c."pushName",
          c."waId",
          c."profilePicUrl",
          c."updatedAt" as "contactUpdatedAt",
          
          -- Dados da Tag
          t.id as "tagId",
          t.name as "tagName",
          t.priority as "tagPriority",
          t."colorName" as "tagColor",
          
          cm.unread_count as "unreadCount",
          cm.last_inbound_ts as "lastInboundTimestamp",
          (cm.last_msg_obj->>'body') as "lastMessageBody",
          (cm.last_msg_obj->>'status') as "lastMessageStatus",
          (cm.last_msg_obj->>'type') as "lastMessageType",
          (cm.last_msg_obj->>'timestamp')::bigint as "lastMessageTimestamp",
          
          COUNT(*) OVER() as total_count

        FROM contacts c
        JOIN ContactMetrics cm ON c.id = cm.id
        LEFT JOIN tags t ON c.tag_id = t.id -- Join para trazer as informações da tag
        WHERE 
          (${unreadOnly}::boolean IS FALSE OR cm.unread_count > 0)

        ORDER BY 
          -- 1. Prioridade da Tag (Nulo por último, maior prioridade primeiro)
          t.priority DESC NULLS LAST,
          -- 2. Timestamp da última mensagem
          COALESCE((cm.last_msg_obj->>'timestamp')::bigint, 0) DESC,
          -- 3. Update do contato como fallback
          c."updatedAt" DESC

        LIMIT ${limit} 
        OFFSET ${offset}
        `;
      // 3. Processamento dos Dados (Mapper)
      const total = Number(contactsRaw[0]?.total_count || 0);
      const totalPages = Math.ceil(total / limit);

      const now = Date.now();
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

      const data = contactsRaw.map((c) => {
        // Cálculo da Janela de 24h
        let isWindowOpen = false;
        if (c.lastInboundTimestamp) {
          // Converter BigInt para Number (Timestamp Unix geralmente cabe em Number JS até o ano 2200+)
          const lastInboundTime = Number(c.lastInboundTimestamp) * 1000;
          isWindowOpen = now - lastInboundTime < TWENTY_FOUR_HOURS;
        }

        // Definir qual data mostrar no card do contato
        let lastMessageAt = c.contactUpdatedAt;
        if (c.lastMessageTimestamp) {
          lastMessageAt = new Date(Number(c.lastMessageTimestamp) * 1000);
        }

        return {
          id: c.id,
          pushName: c.pushName || c.waId, // Fallback visual
          waId: c.waId,
          profilePicUrl: c.profilePicUrl,
          unreadCount: Number(c.unreadCount),
          lastMessage: c.lastMessageBody || '',
          lastMessageStatus: c.lastMessageStatus || undefined,
          lastMessageType: c.lastMessageType || 'text',
          lastMessageAt,
          isWindowOpen,
          tag: c.tagId ? {
            id: c.tagId,
            name: c.tagName || '',
            color: c.tagColor || '',
            priority: c.tagPriority || 0
          } : null
        };
      });

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages,
        },
      };
    },
    {
      auth: true,
      query: t.Object({
        page: t.Optional(t.Number({ default: 1 })),
        limit: t.Optional(t.Number({ default: 20 })),
        search: t.Optional(t.String()),
        unreadOnly: t.Optional(t.String()), // 'true' ou 'false'
      }),
      detail: {
        operationId: 'getWhatsappContacts',
        tags: ['WhatsApp'],
      },
      response: {
        200: PaginatedContactsResponseSchema,
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
        },
      });

      return messages.map((m) => {
        // Extrai contexto de resposta do rawJson
        const rawJson = m.rawJson as {
          context?: { id: string; from?: string };
        } | null;
        const contextId = rawJson?.context?.id;

        // Se tiver context, busca a mensagem citada
        const quotedMessage = contextId
          ? messages.find((msg) => msg.wamid === contextId)
          : null;

        return {
          id: m.id,
          body: m.body, // Se for imagem, aqui pode ser a legenda
          type: m.type, // 'text', 'image', 'video', etc.
          mediaUrl: m.mediaUrl, // URL da imagem
          mediaFileName: m.mediaFileName,
          direction: m.direction,
          status: m.status,
          timestamp: new Date(Number(m.timestamp) * 1000),
          // Parâmetros do template (se for mensagem de template)
          templateParams: (
            m as unknown as {
              templateParams: typeof TemplateParamsStoredSchema.static | null;
            }
          ).templateParams,
          errorCode: m.errorCode,
          errorDesc: m.errorDesc,
          errorDefinition: m.errorDefinition
            ? {
              id: m.errorDefinition.id,
              metaCode: m.errorDefinition.metaCode,
              shortExplanation: m.errorDefinition.shortExplanation,
              detailedExplanation: m.errorDefinition.detailedExplanation,
            }
            : undefined,
          // Context de resposta (quando é reply)
          replyContext: quotedMessage
            ? {
              quotedMessageId: quotedMessage.wamid,
              quotedMessageBody: quotedMessage.body,
              quotedMessageType: quotedMessage.type,
            }
            : null,
        };
      });
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

  // 3. Enviar Mensagem (Simples texto, template e IMAGEM)
  .post(
    '/messages',
    async ({ body, organizationId, set }) => {
      const {
        contactId,
        type,
        message: textMessage,
        template,
        image,
        video,
        audio,
        document,
      } = body;

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
      } else if (type === 'image') {
        // LÓGICA PARA IMAGENS
        if (!image?.url) throw new Error('URL da imagem é obrigatória');

        metaPayload.type = 'image';
        metaPayload.image = {
          link: image.url,
        };

        // Se tiver legenda (caption), adiciona
        if (image.caption) {
          metaPayload.image.caption = image.caption;
        }
      } else if (type === 'video') {
        // LÓGICA PARA VÍDEOS
        if (!video?.url) throw new Error('URL do vídeo é obrigatória');

        metaPayload.type = 'video';
        metaPayload.video = {
          link: video.url,
        };

        // Se tiver legenda (caption), adiciona
        if (video.caption) {
          metaPayload.video.caption = video.caption;
        }
      } else if (type === 'audio') {
        // LÓGICA PARA ÁUDIOS
        if (!audio?.url) throw new Error('URL do áudio é obrigatória');

        metaPayload.type = 'audio';
        metaPayload.audio = {
          link: audio.url,
        };
      } else if (type === 'document') {
        // LÓGICA PARA DOCUMENTOS (PDF, etc)
        if (!document?.url) throw new Error('URL do documento é obrigatória');
        if (!document?.filename)
          throw new Error('Nome do arquivo é obrigatório');

        metaPayload.type = 'document';
        metaPayload.document = {
          link: document.url,
          filename: document.filename,
        };

        // Se tiver legenda (caption), adiciona
        if (document.caption) {
          metaPayload.document.caption = document.caption;
        }
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
        if (
          storedTemplate?.structure &&
          Array.isArray(storedTemplate.structure)
        ) {
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
        let bodyToSave: string | null;
        let mediaUrlToSave: string | null = null;
        let messageType: MessageType;

        if (type === 'text') {
          bodyToSave = textMessage;
          messageType = 'text';
        } else if (type === 'image') {
          bodyToSave = image?.caption || null;
          mediaUrlToSave = image?.url || null;
          messageType = 'image';
        } else if (type === 'video') {
          bodyToSave = video?.caption || null;
          mediaUrlToSave = video?.url || null;
          messageType = 'video';
        } else if (type === 'audio') {
          bodyToSave = null;
          mediaUrlToSave = audio?.url || null;
          messageType = 'audio';
        } else if (type === 'document') {
          bodyToSave = document?.caption || null;
          mediaUrlToSave = document?.url || null;
          messageType = 'document';
        } else {
          bodyToSave = `Template: ${template?.name}`;
          messageType = 'template';
        }

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
            body: bodyToSave,
            type: messageType,
            status: 'SENT',
            timestamp: BigInt(Math.floor(Date.now() / 1000)),
            mediaUrl: mediaUrlToSave,
            processingStatus: 'NONE',
            // @ts-expect-error - campo será adicionado na próxima migration
            templateParams: templateParamsToSave,
          },
        });

        // Update contact updatedAt
        await prisma.contact.update({
          where: { id: contact.id },
          data: { updatedAt: new Date() },
        });

        // --- WEBSOCKET BROADCAST ---
        socketService.broadcast(organizationId, 'chat:message:new', {
          ...savedMsg, // Espalha as propriedades do prisma
          timestamp: new Date(Number(savedMsg.timestamp) * 1000),
          templateParams: templateParamsToSave,
          // Garanta que o payload bate com o que o front espera (MessageItemSchema)
        });

        return {
          ...savedMsg,
          timestamp: new Date(Number(savedMsg.timestamp) * 1000),
          templateParams: templateParamsToSave as
            | typeof TemplateParamsStoredSchema.static
            | null,
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
        type: t.Union([
          t.Literal('text'),
          t.Literal('template'),
          t.Literal('image'),
          t.Literal('video'),
          t.Literal('audio'),
          t.Literal('document'),
        ]),
        message: t.Optional(t.String()),
        template: t.Optional(TemplateParamsSchema),
        image: t.Optional(
          t.Object({
            url: t.String({ format: 'uri' }),
            caption: t.Optional(t.String()),
          })
        ),
        video: t.Optional(
          t.Object({
            url: t.String({ format: 'uri' }),
            caption: t.Optional(t.String()),
          })
        ),
        audio: t.Optional(
          t.Object({
            url: t.String({ format: 'uri' }),
          })
        ),
        document: t.Optional(
          t.Object({
            url: t.String({ format: 'uri' }),
            filename: t.String(),
            caption: t.Optional(t.String()),
          })
        ),
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
  .post(
    '/contacts/:contactId/read',
    async ({ params, organizationId, set }) => {
      const { contactId } = params;

      // 1. Validação de Segurança
      const contact = await prisma.contact.findFirst({
        where: {
          id: contactId,
          instance: { organizationId },
        },
        include: { instance: true }, // Precisamos disso se quisermos avisar o WhatsApp (Opcional)
      });

      if (!contact) {
        set.status = 404;
        return { error: 'Contato não encontrado.' };
      }

      // 2. Atualiza no Banco de Dados
      // Muda tudo que é INBOUND + DELIVERED para READ
      const updateResult = await prisma.message.updateMany({
        where: {
          contactId,
          direction: 'INBOUND',
          status: 'DELIVERED',
        },
        data: {
          status: 'READ',
        },
      });

      // 3. (Opcional) Enviar "Blue Ticks" para o Cliente no WhatsApp
      // Isso faz aparecer os dois tracinhos azuis no celular da pessoa.
      // Se não quiser isso (modo "ninja"), basta comentar este bloco.
      if (updateResult.count > 0) {
        try {
          // Marcamos a ÚLTIMA mensagem como lida na API, o que implicitamente marca as anteriores
          const lastUnread = await prisma.message.findFirst({
            where: { contactId, direction: 'INBOUND', status: 'READ' }, // Já buscamos as que acabamos de atualizar
            orderBy: { timestamp: 'desc' },
          });

          if (lastUnread?.wamid) {
            const url = `https://graph.facebook.com/v21.0/${contact.instance.phoneNumberId}/messages`;
            await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${contact.instance.accessToken}`,
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: lastUnread.wamid,
              }),
            });
          }
        } catch (error) {
          console.error(
            'Erro ao enviar confirmação de leitura para Meta:',
            error
          );
          // Não falhamos a request por isso, é um efeito colateral
        }
      }

      return {
        success: true,
        readCount: updateResult.count,
      };
    },
    {
      auth: true,
      params: t.Object({ contactId: t.String() }),
      detail: {
        tags: ['WhatsApp'],
        summary: 'Marca mensagens recebidas como lidas',
        operationId: 'markWhatsappMessagesAsRead',
      },
      response: {
        200: ReadMessagesResponseSchema,
        404: ErrorResponseSchema,
      },
    }
  );
