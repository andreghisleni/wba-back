import Elysia, { t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

const createListBodySchema = t.Object({
  name: t.String({ minLength: 5 }),
  description: t.Optional(t.String({ minLength: 10 })),
  additionalParams: t.Optional(t.Array(t.String({ minLength: 3 }))),
});

const responseSchema = t.Object({
  error: t.String(),
});

export const createListRoute = new Elysia()
  .macro(authMacro)
  .post(
    '/',
    async ({ body, organizationId, set }) => {
      const { name, description, additionalParams } = body;

      // 1. Valida e seleciona a instância
      // Se o front não mandar instanceId, tentamos pegar a primeira conectada do usuário
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { organizationId },
      });

      if (!instance) {
        set.status = 400;
        return { error: 'Nenhuma instância disponível para criar o contato.' };
      }

      // 2. Cria a lista de transmissão
      const broadcastList = await prisma.broadcastList.create({
        data: {
          name,
          description,
          instanceId: instance.id,
          additionalParams,
        },
      });

      set.status = 201;
      return { ok: true, id: broadcastList.id };
    },
    {
      auth: true,
      detail: {
        summary: 'Cria uma nova lista de transmissão.',
        operationId: 'createBroadcastList',
      },
      body: createListBodySchema,
      response: {
        201: t.Object({
          ok: t.Boolean(),
          id: t.String(),
        }),
        400: responseSchema,
        401: responseSchema,
        403: responseSchema,
      },
    }
  );
