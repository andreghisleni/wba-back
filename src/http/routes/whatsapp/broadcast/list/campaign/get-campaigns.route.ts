import Elysia, { t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

const campaignSchema = t.Object({
  id: t.String(),
  name: t.String(),
  status: t.String(),
  template: t.Object({
    id: t.String(),
    name: t.String(),
  }),
  totalContacts: t.Number(),
  sentCount: t.Number(),
  failedCount: t.Number(),
  readCount: t.Number(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export const getCampaignsRoute = new Elysia()
  .macro(authMacro)
  .get(
    '/',
    async ({ organizationId, set, params, query }) => {
      const { listId } = params;
      const filter = query['f.filter'];
      const status = query['f.status'];
      const page = query['p.page'] ?? 1;
      const pageSize = query['p.pageSize'] ?? 20;

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

      // 3. Monta o filtro de busca
      const whereClause = {
        broadcastListId: listId,
        ...(filter && {
          name: { contains: filter, mode: 'insensitive' as const },
        }),
        ...(status && { status }),
      };

      // 4. Recupera as campanhas com paginação
      const [campaigns, total] = await Promise.all([
        prisma.broadcastCampaign.findMany({
          where: whereClause,
          include: {
            template: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.broadcastCampaign.count({
          where: whereClause,
        }),
      ]);

      return {
        data: campaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          template: {
            id: campaign.template.id,
            name: campaign.template.name,
          },
          totalContacts: campaign.totalContacts,
          sentCount: campaign.sentCount,
          failedCount: campaign.failedCount,
          readCount: campaign.readCount,
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt,
        })),
        meta: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    },
    {
      auth: true,
      detail: {
        summary: 'Recupera todas as campanhas da lista de transmissão.',
        operationId: 'getBroadcastCampaigns',
      },
      params: t.Object({
        listId: t.String(),
      }),
      query: t.Object({
        'f.filter': t.Optional(
          t.String({
            description: 'Filter by campaign name (partial match).',
          })
        ),
        'f.status': t.Optional(
          t.String({
            description: 'Filter by campaign status.',
          })
        ),
        'p.page': t.Optional(
          t.Number({
            description: 'Page number',
            default: 1,
          })
        ),
        'p.pageSize': t.Optional(
          t.Number({
            description: 'Page size',
            default: 20,
          })
        ),
      }),
      response: {
        200: t.Object({
          data: t.Array(campaignSchema),
          meta: t.Object({
            total: t.Number(),
            page: t.Number(),
            pageSize: t.Number(),
            totalPages: t.Number(),
          }),
        }),
        400: t.Object({
          error: t.String(),
        }),
        404: t.Object({
          error: t.String(),
        }),
      },
    }
  );
