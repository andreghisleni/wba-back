import type { Prisma } from "@db/client";
import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

export const orderTypeSchema = t.Union([t.Literal("asc"), t.Literal("desc")], {
  description: "Type of the order",
});

// Schema para o modelo Category
const categorySchema = t.Object(
  {
    id: t.String(),
    name: t.String(),
    rentalPercent: t.Number(),
    description: t.Optional(t.String()),
    createdAt: t.Date(),
    updatedAt: t.Date(),
    _count: t.Optional(t.Object({ equipments: t.Number() })), // Opcional: contar itens
  },
  {
    description: "Schema for a rental category",
  }
);

export const getCategoriesRoute = new Elysia().macro(authMacro).get(
  "/",
  async ({ query }) => {
    const orderBy = [
      query?.["ob.name"] && { name: query?.["ob.name"] },
      query?.["ob.rentalPercent"] && {
        rentalPercent: query?.["ob.rentalPercent"],
      },
      query?.["ob.createdAt"]
        ? { createdAt: query?.["ob.createdAt"] }
        : { createdAt: "desc" },
    ];

    const orFilters: Prisma.CategoryWhereInput[] = [
      {
        name: {
          contains: query?.["f.filter"],
          mode: "insensitive",
        },
      },
    ];

    const where: Prisma.CategoryWhereInput = {
      OR: query?.["f.filter"] ? orFilters : undefined,
    };

    const [categories, total] = await prisma.$transaction([
      prisma.category.findMany({
        where,
        include: {
          _count: { select: { equipments: true } },
        },
        take: query?.["p.pageSize"] ?? 20,
        skip:
          ((query?.["p.page"] ?? 1) - 1) * (query?.["p.pageSize"] ?? 20) ||
          undefined,
        orderBy: [...orderBy.filter((o) => o !== undefined)],
      }),
      prisma.category.count({ where }),
    ]);

    return {
      data: categories.map((category) => ({
        ...category,
        description: category.description || undefined,
      })),
      meta: {
        total,
        page: query?.["p.page"] ?? 1,
        pageSize: query?.["p.pageSize"] ?? 20,
        totalPages: Math.ceil(total / ((query?.["p.pageSize"] ?? 20) || 1)),
      },
    };
  },
  {
    auth: true,
    query: t.Object({
      "f.filter": t.Optional(
        t.String({
          description: "Filter by category name",
        })
      ),
      "p.page": t.Optional(t.Number({ default: 1 })),
      "p.pageSize": t.Optional(t.Number({ default: 20 })),
      "ob.name": t.Optional(orderTypeSchema),
      "ob.rentalPercent": t.Optional(orderTypeSchema),
      "ob.createdAt": t.Optional(orderTypeSchema),
    }),
    response: t.Object({
      data: t.Array(categorySchema),
      meta: t.Object({
        total: t.Number(),
        page: t.Number(),
        pageSize: t.Number(),
        totalPages: t.Number(),
      }),
    }),
    detail: {
      summary: "Get all equipment categories",
      operationId: "getCategories",
    },
  }
);
