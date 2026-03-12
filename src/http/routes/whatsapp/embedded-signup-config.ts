import { Elysia, t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';
import { env } from '~/env';

export const embeddedSignupConfigRoute = new Elysia({
  prefix: '/embedded-signup',
}).macro(authMacro)
  .get('/config', async ({ organizationId, set }) => {
    // Verificar se já existe uma instância ativa
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
    });

    if (instance) {
      set.status = 400;
      return { error: 'Uma instância WhatsApp já está conectada para esta organização.' };
    }

    return {
      appId: env.META_APP_ID,
      configId: env.META_CONFIG_ID,
    };
  }, {
    auth: true,
    response: {
      200: t.Object({
        appId: t.String(),
        configId: t.String(),
      }),
      400: t.Object({
        error: t.String(),
      }),
    },
    detail: {
      summary: 'Retorna configuração para Embedded Signup da Meta',
      tags: ['WhatsApp OAuth'],
      operationId: 'getEmbeddedSignupConfig',
    },
  });
