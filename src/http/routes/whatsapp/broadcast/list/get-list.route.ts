import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

const listSchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  additionalParams: t.Nullable(t.Array(t.String())),
  totalMembers: t.Number(),
  totalCampaigns: t.Number(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export const getListRoute = new Elysia()
  .macro(authMacro)
  .get(':listId', async ({ organizationId, set, params }) => {
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
      include: {
        _count: {
          select: {
            members: true,
            campaigns: true,
          },
        },
      },
    });

    if (!broadcastList) {
      set.status = 404;
      return { error: 'Lista não encontrada.' };
    }

    return {
      id: broadcastList.id,
      name: broadcastList.name,
      description: broadcastList.description,
      additionalParams: broadcastList.additionalParams || [],
      totalMembers: broadcastList._count.members,
      totalCampaigns: broadcastList._count.campaigns,
      createdAt: broadcastList.createdAt,
      updatedAt: broadcastList.updatedAt,
    };
  }, {
    auth: true,
    params: t.Object({
      listId: t.String(),
    }),
    detail: {
      summary: 'Recupera todas as listas de transmissão da instância.',
      operationId: 'getBroadcastList',
    },
    response: {
      200: listSchema,
      400: t.Object({
        error: t.String(),
      }),
      404: t.Object({
        error: t.String(),
      })
    },
  });