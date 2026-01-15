import Elysia, { t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

const memberSchema = t.Object({
  id: t.String(),
  contact: t.Object({
    id: t.String(),
    name: t.Nullable(t.String()),
    phone: t.String(),
  }),
  additionalParams: t.Nullable(t.Unknown()),
  createdAt: t.Date(),
});

export const getMemberRoute = new Elysia()
  .macro(authMacro)
  .get(
    '/:id',
    async ({ organizationId, set, params }) => {
      const { listId, id } = params;

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

      // 3. Recupera o membro
      const member = await prisma.broadcastListMember.findFirst({
        where: { id, broadcastListId: listId },
        include: {
          contact: {
            select: {
              id: true,
              pushName: true,
              waId: true,
            },
          },
        },
      });

      if (!member) {
        set.status = 404;
        return { error: 'Membro não encontrado.' };
      }

      return {
        id: member.id,
        contact: {
          id: member.contact.id,
          name: member.contact.pushName,
          phone: member.contact.waId,
        },
        additionalParams: member.additionalParams,
        createdAt: member.createdAt,
      };
    },
    {
      auth: true,
      detail: {
        summary: 'Recupera um membro específico da lista de transmissão.',
        operationId: 'getBroadcastListMember',
      },
      params: t.Object({
        listId: t.String(),
        id: t.String(),
      }),
      response: {
        200: memberSchema,
        400: t.Object({
          error: t.String(),
        }),
        404: t.Object({
          error: t.String(),
        }),
      },
    }
  );
