import Elysia, { t } from 'elysia';
import { uAuth } from '~/auth';
import { prisma } from '~/db/client';
import type { Prisma } from '~/db/generated/prisma/client';
import { orderTypeSchema } from '~/utils/order-type-schema';
import { tagSchema } from './schemas';

export const getTagsRoute = new Elysia().use(uAuth).get(
  '/',
  async ({ query }) => {
    const orderBy = [
      query?.['ob.name'] && { name: query?.['ob.name'] },
      query?.['ob.priority'] && {
        priority: query?.['ob.priority'],
      },
      query?.['ob.createdAt']
        ? { createdAt: query?.['ob.createdAt'] }
        : { createdAt: 'desc' },
    ];

    const orFilters: Prisma.TagWhereInput[] = [
      {
        name: {
          contains: query?.['f.filter'],
          mode: 'insensitive',
        },
      },
    ];

    const [tags, total] = await prisma.$transaction([
      prisma.tag.findMany({
        where: {
          OR: query?.['f.filter'] ? orFilters : undefined,
        },
        take: query?.['p.pageSize'] ?? 20,
        skip:
          ((query?.['p.page'] ?? 1) - 1) * (query?.['p.pageSize'] ?? 20) ||
          undefined,
        orderBy: [
          ...orderBy.filter((o) => o !== undefined),
        ] as Prisma.TagOrderByWithRelationInput[],
      }),
      prisma.tag.count({
        where: {
          OR: query?.['f.filter'] ? orFilters : undefined,
        },
      }),
    ]);

    return {
      data: tags.map(({ ...tag }) => ({
        ...tag,
      })),
      meta: {
        total,
        page: query?.['p.page'] ?? 1,
        pageSize: query?.['p.pageSize'] ?? 20,
        totalPages: Math.ceil(total / ((query?.['p.pageSize'] ?? 20) || 1)),
      },
    };
  },
  {
    auth: true,
    detail: {
      tags: ['Tags'],
      summary: 'Get all tags',
      operationId: 'getTags',
    },
    response: t.Object(
      {
        data: t.Array(tagSchema),
        meta: t.Object(
          {
            total: t.Number(),
            page: t.Number(),
            pageSize: t.Number(),
            totalPages: t.Number(),
          },
          {
            description: 'Pagination metadata',
          }
        ),
      },
      {
        description: 'Response schema for getting tags',
      }
    ),
    query: t.Object({
      'f.filter': t.Optional(
        t.String({
          description: 'Filter by tag fields',
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
      'ob.name': t.Optional(orderTypeSchema),
      'ob.priority': t.Optional(orderTypeSchema),
      'ob.createdAt': t.Optional(orderTypeSchema),
    }),
  }
);
