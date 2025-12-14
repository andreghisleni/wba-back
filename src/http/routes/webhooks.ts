/** biome-ignore-all lint/suspicious/noExplicitAny: i don't have the exact type for payload */
import { Elysia, t } from 'elysia'
import { authMacro } from '~/auth'
import { prisma } from '~/db/client'

// --- SCHEMAS COMPARTILHADOS ---

// Enum dos Eventos
const EventEnum = t.Union([
  t.Literal('message.received'),
  t.Literal('message.sent'),
  t.Literal('message.status')
])

// Schema do Webhook (Retorno)
const WebhookSchema = t.Object({
  id: t.String(),
  name: t.String(),
  url: t.String(),
  events: t.Array(t.String()), // Array de strings no retorno para ser genérico ou EventEnum
  secret: t.Optional(t.String()),
  enabled: t.Boolean(),
  createdAt: t.Date(),
  // Opcional: Contagem de logs (vem do include _count)
  _count: t.Optional(t.Object({
    logs: t.Number()
  }))
})

// Schema de Log
const WebhookLogSchema = t.Object({
  id: t.String(),
  event: t.String(),
  // Payload e ResponseBody podem ser null ou string/json
  responseStatus: t.Union([t.Number(), t.Null()]),
  duration: t.Union([t.Number(), t.Null()]),
  success: t.Boolean(),
  createdAt: t.Date()
})

export const webhookRoutes = new Elysia({ prefix: '/webhooks' })
  .macro(authMacro)
  // --- 1. LISTAR WEBHOOKS ---
  .get('/', async ({ organizationId }) => {
    const webhooks = await prisma.webhook.findMany({
      where: { organizationId },
      include: {
        _count: { select: { logs: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return webhooks.map(wh => ({
      ...wh,
      secret: wh.secret || undefined
    }));
  }, {
    auth: true,
    response: {
      200: t.Array(WebhookSchema)
    },
    detail: {
      tags: ['Webhooks'],
      summary: 'Listar webhooks configurados',
      operationId: 'getWebhooks'
    }
  })

  // --- 2. CRIAR WEBHOOK ---
  .post('/', async ({ body, organizationId }) => {
    const webhook = await prisma.webhook.create({
      data: {
        name: body.name,
        url: body.url,
        events: body.events,
        secret: body.secret,
        organizationId
      }
    });

    return {
      ...webhook,
      secret: webhook.secret || undefined
    };
  }, {
    auth: true,
    body: t.Object({
      name: t.String({ minLength: 3 }),
      url: t.String({ format: 'uri' }),
      events: t.Array(EventEnum, { minItems: 1 }),
      secret: t.Optional(t.String()),
    }),
    response: {
      200: WebhookSchema
    },
    detail: {
      tags: ['Webhooks'],
      summary: 'Criar novo webhook',
      operationId: 'createWebhook'
    }
  })

  // --- 3. ATUALIZAR WEBHOOK (Editar) ---
  .put('/:id', async ({ params, body, organizationId, set }) => {
    const webhook = await prisma.webhook.findFirst({
      where: { id: params.id, organizationId }
    })

    if (!webhook) {
      set.status = 404
      return { error: 'Webhook não encontrado.' }
    }

    const updatedWebhook = await prisma.webhook.update({
      where: { id: params.id },
      data: {
        name: body.name,
        url: body.url,
        events: body.events,
        enabled: body.enabled,
        secret: body.secret,
      }
    });

    return {
      ...updatedWebhook,
      secret: updatedWebhook.secret || undefined
    };
  }, {
    auth: true,
    params: t.Object({ id: t.String() }),
    body: t.Object({
      name: t.String(),
      url: t.String(),
      events: t.Array(EventEnum),
      enabled: t.Boolean(),
      secret: t.Optional(t.String())
    }),
    response: {
      200: WebhookSchema,
      404: t.Object({ error: t.String() })
    },
    detail: {
      tags: ['Webhooks'],
      summary: 'Atualizar configurações do webhook',
      operationId: 'updateWebhook'
    }
  })

  // --- 4. DELETAR WEBHOOK ---
  .delete('/:id', async ({ params, organizationId, set }) => {
    const count = await prisma.webhook.deleteMany({
      where: { id: params.id, organizationId }
    })

    if (!count.count) {
      set.status = 404
      return { error: 'Webhook não encontrado.' }
    }

    return { success: true }
  }, {
    auth: true,
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({ success: t.Boolean() }),
      404: t.Object({ error: t.String() })
    },
    detail: {
      tags: ['Webhooks'],
      summary: 'Remover webhook',
      operationId: 'deleteWebhook'
    }
  })

  // --- 5. LISTAR LOGS (Histórico) ---
  .get('/:id/logs', async ({ params, organizationId, set }) => {
    const webhook = await prisma.webhook.findFirst({
      where: { id: params.id, organizationId }
    })

    if (!webhook) {
      set.status = 404
      return [] // Retorna array vazio se não achar, ou erro
    }

    // Buscamos apenas os campos essenciais para a lista
    const logs = await prisma.webhookLog.findMany({
      where: { webhookId: params.id },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        event: true,
        responseStatus: true,
        duration: true,
        success: true,
        createdAt: true,
        // Não trazemos o payload/responseBody aqui para não pesar a listagem
      }
    })

    return logs
  }, {
    auth: true,
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Array(WebhookLogSchema),
      404: t.Array(t.Any()) // Fallback
    },
    detail: {
      tags: ['Webhooks'],
      summary: 'Ver histórico de disparos',
      operationId: 'getWebhookLogs'
    }
  })

  // --- 6. DETALHE DO LOG (Para ver Payload/Response) ---
  .get('/logs/:logId', async ({ params, organizationId, set }) => {
    // Precisamos validar se o log pertence a um webhook da organização
    const log = await prisma.webhookLog.findFirst({
      where: {
        id: params.logId,
        webhook: { organizationId }
      },
      include: { webhook: true }
    })

    if (!log) {
      set.status = 404
      return { error: 'Log não encontrado.' }
    }

    return log
  }, {
    auth: true,
    params: t.Object({ logId: t.String() }),
    response: {
      200: t.Object({
        id: t.String(),
        event: t.String(),
        payload: t.Any(), // JSON
        responseBody: t.Union([t.String(), t.Null()]),
        responseStatus: t.Union([t.Number(), t.Null()]),
        createdAt: t.Date()
      }),
      404: t.Object({ error: t.String() })
    },
    detail: {
      tags: ['Webhooks'],
      summary: 'Ver detalhes de um disparo específico',
      operationId: 'getWebhookLogDetails'
    }
  })

  // --- 7. TESTAR WEBHOOK (Ping) ---
  .post('/:id/test', async ({ params, organizationId, set }) => {
    const webhook = await prisma.webhook.findFirst({
      where: { id: params.id, organizationId }
    })

    if (!webhook) {
      set.status = 404
      return { error: 'Webhook não encontrado.' }
    }

    try {
      const startTime = Date.now()
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wba-Signature': webhook.secret || '',
          'X-Wba-Event': 'ping',
          'X-Wba-Webhook-Id': webhook.id,
        },
        body: JSON.stringify({
          event: 'ping',
          timestamp: new Date().toISOString(),
          message: 'Isso é um teste de conexão do WBA.'
        })
      })

      const duration = Date.now() - startTime
      const bodyText = await res.text()

      return {
        success: res.ok,
        status: res.status,
        duration,
        responseBody: bodyText.slice(0, 500) // Preview
      }
    } catch (e: any) {
      return {
        success: false,
        status: 0,
        duration: 0,
        responseBody: e.message
      }
    }
  }, {
    auth: true,
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({
        success: t.Boolean(),
        status: t.Number(),
        duration: t.Number(),
        responseBody: t.String()
      }),
      404: t.Object({ error: t.String() })
    },
    detail: {
      tags: ['Webhooks'],
      summary: 'Testar conexão (Ping)',
      operationId: 'testWebhook'
    }
  })