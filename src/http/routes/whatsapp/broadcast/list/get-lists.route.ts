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

export const getListsRoute = new Elysia()
  .macro(authMacro)
  .get('/', async ({ organizationId, set }) => {
    // 1. Valida e seleciona a instância
    // Se o front não mandar instanceId, tentamos pegar a primeira conectada do usuário
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { organizationId },
    });

    if (!instance) {
      set.status = 400;
      return { error: 'Nenhuma instância disponível para criar o contato.' };
    };

    const broadcastLists = await prisma.broadcastList.findMany({
      where: { instanceId: instance.id },
      include: {
        _count: {
          select: {
            members: true,
            campaigns: true,
          },
        },
      },
    });

    return broadcastLists.map(list => ({
      id: list.id,
      name: list.name,
      description: list.description,
      additionalParams: list.additionalParams || [],
      totalMembers: list._count.members,
      totalCampaigns: list._count.campaigns,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
    }));
  }, {
    auth: true,
    detail: {
      summary: 'Recupera todas as listas de transmissão da instância.',
      operationId: 'getBroadcastLists',
    },
    response: {
      200: t.Array(listSchema),
      400: t.Object({
        error: t.String(),
      }),
    },
  });