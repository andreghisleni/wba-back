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

export const getCampaignRoute = new Elysia()
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

      // 3. Recupera a campanha
      const campaign = await prisma.broadcastCampaign.findFirst({
        where: { id, broadcastListId: listId },
        include: {
          template: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!campaign) {
        set.status = 404;
        return { error: 'Campanha não encontrada.' };
      }

      return {
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
      };
    },
    {
      auth: true,
      detail: {
        summary: 'Recupera uma campanha específica da lista de transmissão.',
        operationId: 'getBroadcastCampaign',
      },
      params: t.Object({
        listId: t.String(),
        id: t.String(),
      }),
      response: {
        200: campaignSchema,
        400: t.Object({
          error: t.String(),
        }),
        404: t.Object({
          error: t.String(),
        }),
      },
    }
  );
