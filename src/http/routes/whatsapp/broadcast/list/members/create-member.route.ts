import Elysia, { t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

const createMemberBodySchema = t.Object({
  contactId: t.String(),
  additionalParams: t.Optional(t.Any()),
});

const responseSchema = t.Object({
  error: t.String(),
});

export const createMemberRoute = new Elysia()
  .macro(authMacro)
  .post(
    '/',
    async ({ body, organizationId, set, params }) => {
      const { contactId, additionalParams } = body;
      const { listId } = params;

      // 1. Valida e seleciona a instância
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { organizationId },
      });

      if (!instance) {
        set.status = 400;
        return { error: 'Nenhuma instância disponível.' };
      }

      // 2. Verifica se a lista existe e pertence à instância
      const broadcastList = await prisma.broadcastList.findFirst({
        where: { id: listId, instanceId: instance.id },
      });

      if (!broadcastList) {
        set.status = 404;
        return { error: 'Lista de transmissão não encontrada.' };
      }

      // 3. Verifica se o contato existe
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, instanceId: instance.id },
      });

      if (!contact) {
        set.status = 404;
        return { error: 'Contato não encontrado.' };
      }

      // 4. Verifica se o membro já existe na lista
      const existingMember = await prisma.broadcastListMember.findFirst({
        where: { broadcastListId: listId, contactId },
      });

      if (existingMember) {
        set.status = 409;
        return { error: 'Contato já é membro desta lista.' };
      }

      // 5. Cria o membro
      const member = await prisma.broadcastListMember.create({
        data: {
          broadcastListId: listId,
          contactId,
          additionalParams,
        },
      });

      set.status = 201;
      return { ok: true, id: member.id };
    },
    {
      auth: true,
      detail: {
        summary: 'Adiciona um membro à lista de transmissão.',
        operationId: 'createBroadcastListMember',
      },
      body: createMemberBodySchema,
      params: t.Object({
        listId: t.String(),
      }),
      response: {
        201: t.Object({
          ok: t.Boolean(),
          id: t.String(),
        }),
        400: responseSchema,
        401: responseSchema,
        403: responseSchema,
        404: responseSchema,
        409: responseSchema,
      },
    }
  );
