import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

const updateListBodySchema = t.Object({
  name: t.String({ minLength: 5 }),
  description: t.Optional(t.String({ minLength: 10 })),
  additionalParams: t.Optional(t.Array(t.String({ minLength: 3 }))),
});

const responseSchema = t.Object({
  error: t.String(),
})

export const updateListRoute = new Elysia({
  prefix: '/',
})
  .macro(authMacro)
  .put('/:listId', async ({ body, params, organizationId, set }) => {
    const { name, description, additionalParams } = body;
    const { listId: id } = params;

    // 1. Valida e seleciona a instância
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { organizationId },
    });

    if (!instance) {
      set.status = 400;
      return { error: 'Nenhuma instância disponível para atualizar a lista.' };
    }

    // 2. Recupera a lista e valida que pertence à instância
    const broadcastList = await prisma.broadcastList.findFirst({
      where: { id, instanceId: instance.id },
    });

    if (!broadcastList) {
      set.status = 404;
      return { error: 'Lista não encontrada.' };
    }

    // 3. Se houver contatos vinculados, não permitir atualizar additionalParams
    const additionalParamsChanged =
      additionalParams !== undefined &&
      JSON.stringify(additionalParams) !== JSON.stringify(broadcastList.additionalParams);

    if (additionalParamsChanged) {
      const membersCount = await prisma.broadcastListMember.count({
        where: { broadcastListId: broadcastList.id },
      });

      if (membersCount > 0) {
        set.status = 400;
        return { error: 'Não é permitido atualizar additionalParams quando a lista tem contatos vinculados.' };
      }
    }

    await prisma.broadcastList.update({
      where: { id: broadcastList.id },
      data: {
        name,
        description,
        additionalParams,
      },
    });

    set.status = 200;
    return { ok: true };
  }, {
    auth: true,
    detail: {
      summary: 'Atualiza uma lista de transmissão. Não permite alterar additionalParams se houver membros.',
      operationId: 'updateBroadcastList',
    },
    body: updateListBodySchema,
    query: t.Object({ listId: t.String() }),
    response: {
      200: t.Object({ ok: t.Boolean() }),
      400: responseSchema,
      401: responseSchema,
      403: responseSchema,
      404: responseSchema,
    },
  });
