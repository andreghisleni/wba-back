import { Elysia, t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';
import { env } from '~/env';

export const whatsappOauthLinkRoute = new Elysia({
  prefix: '/oauth',
}).macro(authMacro)
  .get('/link', async ({ query, organizationId, set }) => {
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


    const FACEBOOK_APP_ID = env.META_APP_ID;
    const REDIRECT_URI =
      query.redirect_uri || `${env.META_CALLBACK_URL}/webhook/oauth/callback`;
    const SCOPE = [
      'public_profile',
      'email',
      'whatsapp_business_management',
      'whatsapp_business_messaging',
    ].join(',');
    const state = crypto.randomUUID();
    const rootUrl = 'https://www.facebook.com/v21.0/dialog/oauth';

    // --- AQUI ESTÁ A MÁGICA ---
    // O objeto 'extras' configura o Embedded Signup
    const extras = JSON.stringify({
      feature: 'whatsapp_embedded_signup',
      version: 2,
      sessionInfoVersion: 3,
      setup: {
        // Se você tiver um config_id (Tech Provider), coloque aqui:
        config_id: env.META_CONFIG_ID,
        // Opcional: pré-preencher dados da empresa se você já tiver
        // business: {
        //   name: "Nome da Empresa do Cliente",
        //   email: "email@cliente.com"
        // }
      }
    });

    const params = new URLSearchParams({
      client_id: FACEBOOK_APP_ID,
      redirect_uri: REDIRECT_URI,
      state,
      scope: SCOPE,
      response_type: 'code',
      // extras,
    });
    return {
      url: `${rootUrl}?${params.toString()}`,
      state,
    };
  }, {
    auth: true,
    query: t.Object({
      redirect_uri: t.Optional(t.String()),
    }),
    response: {
      200: t.Object({
        url: t.String(),
        state: t.String(),
      }),
      400: t.Object({
        error: t.String(),
      }),
    },
    detail: {
      summary: 'Gera o link de autorização OAuth da Meta',
      tags: ['WhatsApp OAuth'],
      operationId: 'generateWhatsappOauthLink',
    },
  });
