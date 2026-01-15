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

export const getMembersRoute = new Elysia()
  .macro(authMacro)
  .get(
    '/',
    async ({ organizationId, set, params, query }) => {
      const { listId } = params;
      const filter = query['f.filter'];
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
          contact: {
            OR: [
              { pushName: { contains: filter, mode: 'insensitive' as const } },
              { waId: { contains: filter, mode: 'insensitive' as const } },
            ],
          },
        }),
      };

      // 4. Recupera os membros com paginação
      const [members, total] = await Promise.all([
        prisma.broadcastListMember.findMany({
          where: whereClause,
          include: {
            contact: {
              select: {
                id: true,
                pushName: true,
                waId: true,
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.broadcastListMember.count({
          where: whereClause,
        }),
      ]);

      return {
        data: members.map((member) => ({
          id: member.id,
          contact: {
            id: member.contact.id,
            name: member.contact.pushName,
            phone: member.contact.waId,
          },
          additionalParams: member.additionalParams,
          createdAt: member.createdAt,
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
        summary: 'Recupera todos os membros da lista de transmissão.',
        operationId: 'getBroadcastListMembers',
      },
      params: t.Object({
        listId: t.String(),
      }),
      query: t.Object({
        "f.filter": t.Optional(
          t.String({
            description:
              "Filter by member contact name or phone (partial match).",
          })
        ),
        "p.page": t.Optional(
          t.Number({
            description: "Page number",
            default: 1,
          })
        ),
        "p.pageSize": t.Optional(
          t.Number({
            description: "Page size",
            default: 20,
          })
        ),
      }),
      response: {
        200: t.Object({
          data: t.Array(memberSchema),
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
