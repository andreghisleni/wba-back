import Elysia, { t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';
import {
  type CampaignTemplateParams,
  enqueueBroadcastMessages,
  resolveTemplateParams,
} from '~/queue/broadcast-setup';

// Schema para mapeamento de parâmetros do template
const templateParamMappingSchema = t.Object({
  source: t.Union([t.Literal('fixed'), t.Literal('member')]),
  value: t.Optional(t.String()), // usado quando source = 'fixed'
  key: t.Optional(t.String()), // usado quando source = 'member'
});

const buttonParamMappingSchema = t.Object({
  index: t.Number(),
  source: t.Union([t.Literal('fixed'), t.Literal('member')]),
  value: t.Optional(t.String()),
  key: t.Optional(t.String()),
});

const campaignTemplateParamsSchema = t.Object({
  bodyParams: t.Optional(t.Array(templateParamMappingSchema)),
  buttonParams: t.Optional(t.Array(buttonParamMappingSchema)),
});

const createCampaignBodySchema = t.Object({
  name: t.String({ minLength: 3 }),
  templateId: t.String(),
  templateParams: t.Optional(campaignTemplateParamsSchema),
});

const responseSchema = t.Object({
  error: t.String(),
});

export const createCampaignRoute = new Elysia().macro(authMacro).post(
  '/',
  async ({ body, organizationId, set, params }) => {
    const { name, templateId, templateParams } = body;
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

    // 3. Verifica se o template existe
    const template = await prisma.template.findFirst({
      where: { id: templateId, instanceId: instance.id },
    });

    if (!template) {
      set.status = 404;
      return { error: 'Template não encontrado.' };
    }

    // 4. Valida se os keys de 'member' existem nos additionalParams da lista
    if (templateParams) {
      const listParamKeys = broadcastList.additionalParams ?? [];

      const memberKeys: string[] = [];
      for (const param of templateParams.bodyParams ?? []) {
        if (param.source === 'member' && param.key) {
          memberKeys.push(param.key);
        }
      }
      for (const param of templateParams.buttonParams ?? []) {
        if (param.source === 'member' && param.key) {
          memberKeys.push(param.key);
        }
      }

      const invalidKeys = memberKeys.filter((k) => !listParamKeys.includes(k));
      if (invalidKeys.length > 0) {
        set.status = 400;
        return {
          error: `Os seguintes campos não existem na lista: ${invalidKeys.join(', ')}. Campos disponíveis: ${listParamKeys.join(', ')}`,
        };
      }
    }

    // 5. Busca todos os membros da lista
    const members = await prisma.broadcastListMember.findMany({
      where: { broadcastListId: listId },
      include: {
        contact: {
          select: {
            id: true,
            waId: true,
          },
        },
      },
    });

    if (members.length === 0) {
      set.status = 400;
      return { error: 'A lista não possui membros.' };
    }

    // 6. Cria a campanha já com status PROCESSING
    const campaign = await prisma.broadcastCampaign.create({
      data: {
        name,
        templateId,
        templateParams,
        broadcastListId: listId,
        instanceId: instance.id,
        totalContacts: members.length,
        status: 'PROCESSING',
      },
    });

    // 7. Prepara os jobs para a fila
    const campaignTemplateParams = templateParams as
      | CampaignTemplateParams
      | undefined;

    const jobs = members.map((member) => {
      const { bodyValues, buttonValues } = resolveTemplateParams(
        campaignTemplateParams ?? {},
        member.additionalParams as Record<string, unknown> | null
      );

      return {
        memberId: member.id,
        contactId: member.contact.id,
        contactWaId: member.contact.waId,
        instanceId: instance.id,
        templateId: template.id,
        templateName: template.name,
        templateLanguage: template.language,
        bodyValues,
        buttonValues,
      };
    });

    // 8. Enfileira as mensagens
    const enqueuedCount = await enqueueBroadcastMessages(campaign.id, jobs);

    set.status = 201;
    return {
      ok: true,
      id: campaign.id,
      enqueuedCount,
      message: `Campanha criada e ${enqueuedCount} mensagens enfileiradas para envio.`,
    };
  },
  {
    auth: true,
    detail: {
      summary: 'Cria uma nova campanha de transmissão para a lista.',
      operationId: 'createBroadcastCampaign',
    },
    body: createCampaignBodySchema,
    params: t.Object({
      listId: t.String(),
    }),
    response: {
      201: t.Object({
        ok: t.Boolean(),
        id: t.String(),
        enqueuedCount: t.Number(),
        message: t.String(),
      }),
      400: responseSchema,
      401: responseSchema,
      403: responseSchema,
      404: responseSchema,
    },
  }
);
