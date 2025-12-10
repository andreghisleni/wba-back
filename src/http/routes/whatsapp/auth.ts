import { Elysia, t } from 'elysia';
import { env } from '~/env';

// Definição das interfaces internas (não expostas na API, apenas lógica interna)
interface FacebookTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

export const whatsappAuthRoutes = new Elysia({ prefix: '/auth' })
  .post('/exchange', async ({ body, set }) => {
    const { code } = body;

    const clientId = env.META_APP_ID
    const clientSecret = env.META_APP_SECRET;
    // const redirectUri = Bun.env.FACEBOOK_REDIRECT_URI;

    if (!clientId || !clientSecret /* || !redirectUri */) {
      set.status = 500;
      return { message: "Configuração do servidor incompleta (.env)" };
    }

    try {
      const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
      tokenUrl.searchParams.append("client_id", clientId);
      tokenUrl.searchParams.append("redirect_uri", 'https://webhooks.andreg.com.br/webhook/oauth/callback');
      tokenUrl.searchParams.append("client_secret", clientSecret);
      tokenUrl.searchParams.append("code", code);

      const response = await fetch(tokenUrl.toString());
      const data = await response.json() as FacebookTokenResponse;

      if (data.error) {
        set.status = 400;

        return {
          message: "Falha ao autenticar com Facebook",
          details: data.error.message
        };
      }

      return {
        success: true,
        accessToken: data.access_token,
        expiresIn: data.expires_in
      };

    } catch (err) {
      set.status = 500;
      return { message: "Erro ao conectar com servidor do Facebook" };
    }
  }, {
    // 1. Validação de Entrada (Isso gera o tipo do Payload no Kubb)
    body: t.Object({
      code: t.String({
        description: 'O código retornado pelo Facebook na URL de callback',
        minLength: 1
      })
    }),

    // 2. Validação de Saída (Isso gera as Interfaces de Resposta no Kubb)
    response: {
      200: t.Object({
        success: t.Boolean(),
        accessToken: t.String(),
        expiresIn: t.Number()
      }, { description: 'Token gerado com sucesso' }),

      400: t.Object({
        message: t.String(),
        details: t.Optional(t.String())
      }, { description: 'Erro de validação ou erro da Meta' }),

      500: t.Object({
        message: t.String()
      }, { description: 'Erro interno do servidor' })
    },

    // 3. Metadados do OpenAPI (Ouro para o Kubb)
    detail: {
      tags: ['Auth'], // Agrupa no Swagger/Kubb
      summary: 'Troca Code por Token', // Descrição curta
      description: 'Recebe o code do fluxo OAuth e troca por um access_token de longa duração via Server-to-Server.',
      operationId: 'exchangeFacebookCode', // O Kubb usará isso para criar o hook: useExchangeFacebookCode()
    }
  });