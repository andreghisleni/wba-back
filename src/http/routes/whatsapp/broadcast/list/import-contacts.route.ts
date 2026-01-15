import Elysia, { t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';
import { upsertSmartContact } from '~/services/contact-service';

const importMemberSchema = t.Object({
  name: t.String({ minLength: 5 }),
  phone: t.String({ minLength: 10 }),
  additionalParams: t.Optional(t.Any()),
});

const responseSchema = t.Object({
  error: t.String(),

  invalidMembers: t.Optional(t.Array(
    t.Object({
      phone: t.String(),
      missingParams: t.Array(t.String()),
    })
  )),
});

export const importMembersRoute = new Elysia().macro(authMacro).post(
  '/:listId/members/import',
  async ({ body, organizationId, set, params }) => {
    const { members } = body;
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

    if (members.length === 0) {
      set.status = 400;
      return { error: 'Nenhum contato para importar.' };
    }

    const requiredParams = broadcastList.additionalParams || [];

    const invalidMembers = members.filter((member: typeof importMemberSchema) => {
      if (!requiredParams || requiredParams.length === 0) {
        return false;
      }

      if (!member.additionalParams) {
        return true;
      }

      const memberParams = Object.keys(member.additionalParams);
      return !requiredParams.every((param) => memberParams.includes(param));
    });

    if (invalidMembers.length > 0) {
      set.status = 400;
      return {
        error:
          'Alguns contatos estão faltando parâmetros adicionais obrigatórios.',
        invalidMembers: invalidMembers.map((member: typeof importMemberSchema) => ({
          phone: member.phone,
          missingParams: requiredParams.filter(
            (param) =>
              !(member.additionalParams && param in member.additionalParams)
          ),
        })),
      };
    }

    // busca todos os ids dos contatos usando o upsertSmartContact que já verifica os que nao existem e cria esses
    const membersWithIds = await Promise.all(
      members.map(async (member: typeof importMemberSchema) => {
        // Usar a função de upsertSmartContact para garantir que o contato exista
        const contact = await upsertSmartContact({
          instanceId: instance.id,
          phoneNumber: member.phone,
          name: member.name,
        });
        return {
          ...member,
          contactId: contact.id,
        };
      })
    );

    // 3. Adiciona os contatos à lista de transmissão
    const result = await prisma.broadcastListMember.createMany({
      data: membersWithIds.map((member) => ({
        broadcastListId: broadcastList.id,
        contactId: member.contactId,
        additionalParams: member.additionalParams,
      })),
      skipDuplicates: true,
    });

    set.status = 201;
    return { ok: true, totalReceived: members.length, totalImported: result.count };

  },
  {
    auth: true,
    detail: {
      summary: 'Importa membros para a lista de transmissão.',
      operationId: 'importMembersToBroadcastList',
    },
    params: t.Object({
      listId: t.String(),
    }),
    body: t.Object({
      members: t.Array(importMemberSchema),
    }),
    response: {
      201: t.Object({
        ok: t.Boolean(),
        totalReceived: t.Number(),
        totalImported: t.Number(),
      }),
      400: responseSchema,
      401: responseSchema,
      403: responseSchema,
    },
  }
);
