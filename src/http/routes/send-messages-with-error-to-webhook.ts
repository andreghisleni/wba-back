import { Elysia, t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';
import { webhookService } from '~/services/webhook-service';

export const sendMessagesWithErrorToWebhookRoutes = new Elysia({ prefix: '/send-messages-with-error-to-webhook' })
  .macro(authMacro)
  .post('/', async ({ organizationId, set }) => {

    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
    });

    if (!instance) {
      set.status = 404;
      return { error: 'Nenhuma instância WhatsApp ativa encontrada para esta organização.' };
    }

    const instanceId = instance.id;

    // Buscar as últimas falhas de envio
    const recentErrors = await prisma.message.findMany({
      where: {
        instanceId,
        status: 'FAILED'
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        wamid: true,
        timestamp: true,
        contact: {
          select: {
            waId: true,     // O número do telefone (5548...) 
            pushName: true  // O nome do perfil (opcional)
          }
        },
        errorCode: true,
        errorDesc: true,
        createdAt: true
      }
    });

    const results = await Promise.all(recentErrors.map(async (errorMsg) => {
      return await webhookService.dispatch(
        instance.organizationId,
        'message.status',
        {
          event: 'failed', // 'sent', 'delivered', 'read', 'failed'
          wamid: errorMsg.wamid,
          // Converte timestamp unix (segundos) para ISO Date String legível
          timestamp: new Date(
            Number(errorMsg.timestamp) * 1000
          ).toISOString(),
          error: errorMsg.errorDesc,
          errorCode: errorMsg.errorCode,
          to: errorMsg.contact,
        }
      );
    }));

    return { resended: results.length };
  }, {
    auth: true,
    response: {
      200: t.Object({
        resended: t.Number(),
      }, {
        description: 'Mensagens com erro de envio enviadas ao webhook com sucesso.',
      }),
      404: t.Object({
        error: t.String(),
      }),
    },
    detail: {
      summary: 'Reenviar últimas mensagens com erro ao webhook',
      tags: ['Messages'],
      operationId: 'resendErrorMessagesToWebhook'
    },
  });