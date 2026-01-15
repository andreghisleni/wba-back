import Elysia, { t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

const responseSchema = t.Object({
  error: t.String(),
});

export const deleteMemberRoute = new Elysia()
  .macro(authMacro)
  .delete(
    '/:id',
    async ({ params, organizationId, set }) => {
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
      });

      if (!member) {
        set.status = 404;
        return { error: 'Membro não encontrado.' };
      }

      // 4. Remove o membro
      await prisma.broadcastListMember.delete({
        where: { id: member.id },
      });

      set.status = 200;
      return { ok: true };
    },
    {
      auth: true,
      detail: {
        summary: 'Remove um membro da lista de transmissão.',
        operationId: 'deleteBroadcastListMember',
      },
      params: t.Object({
        listId: t.String(),
        id: t.String(),
      }),
      response: {
        200: t.Object({ ok: t.Boolean() }),
        400: responseSchema,
        401: responseSchema,
        403: responseSchema,
        404: responseSchema,
      },
    }
  );
