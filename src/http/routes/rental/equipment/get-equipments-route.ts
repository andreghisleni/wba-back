import type { Prisma } from "@db/client";
import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

export const orderTypeSchema = t.Union([t.Literal("asc"), t.Literal("desc")]);

// Schema para o modelo Equipment
const equipmentSchema = t.Object(
  {
    id: t.String(),
    name: t.String(),
    categoryId: t.String(),
    category: t.Object({
      id: t.String(),
      name: t.String(),
      rentalPercent: t.Number(),
      description: t.Optional(t.String()),
    }),
    // O hack do client.ts converte Decimal para Number, então usamos t.Number()
    purchasePrice: t.Number(),
    rentalPrice: t.Nullable(t.Number()),
    stockQuantity: t.Number(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  {
    description: "Schema for an equipment item",
  }
);

export const getEquipmentsRoute = new Elysia().macro(authMacro).get(
  "/",
  async ({ query }) => {
    const orderBy = [
      query?.["ob.name"] && { name: query?.["ob.name"] },
      query?.["ob.purchasePrice"] && {
        purchasePrice: query?.["ob.purchasePrice"],
      },
      query?.["ob.rentalPrice"] && { rentalPrice: query?.["ob.rentalPrice"] },
      query?.["ob.stockQuantity"] && {
        stockQuantity: query?.["ob.stockQuantity"],
      },
      query?.["ob.categoryName"] && {
        category: { name: query?.["ob.categoryName"] },
      },
      query?.["ob.createdAt"]
        ? { createdAt: query?.["ob.createdAt"] }
        : { createdAt: "desc" },
    ];

    const orFilters: Prisma.EquipmentWhereInput[] = [
      {
        name: {
          contains: query?.["f.filter"],
          mode: "insensitive",
        },
      },
      {
        category: {
          name: {
            contains: query?.["f.filter"],
            mode: "insensitive",
          },
        },
      },
    ];

    const where: Prisma.EquipmentWhereInput = {
      OR: query?.["f.filter"] ? orFilters : undefined,
      categoryId: query?.["f.categoryId"] ? query?.["f.categoryId"] : undefined,
    };

    const [equipments, total] = await prisma.$transaction([
      prisma.equipment.findMany({
        where,
        include: {
          category: true,
        },
        take: query?.["p.pageSize"] ?? 20,
        skip:
          ((query?.["p.page"] ?? 1) - 1) * (query?.["p.pageSize"] ?? 20) ||
          undefined,
        orderBy: [...orderBy.filter((o) => o !== undefined)],
      }),
      prisma.equipment.count({ where }),
    ]);

    return {
      data: equipments.map(
        ({ purchasePrice, rentalPrice, category, ...rest }) => ({
          ...rest,
          purchasePrice: purchasePrice.toNumber(),
          rentalPrice: rentalPrice?.toNumber() ?? null,

          category: {
            ...category,
            description: category.description || undefined,
          },
        })
      ),
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
          description: "Filter by equipment name or category name",
        })
      ),
      "f.categoryId": t.Optional(
        t.String({
          description: "Filter by category ID",
        })
      ),
      "p.page": t.Optional(t.Number({ default: 1 })),
      "p.pageSize": t.Optional(t.Number({ default: 20 })),
      // Ordenações
      "ob.name": t.Optional(orderTypeSchema),
      "ob.purchasePrice": t.Optional(orderTypeSchema),
      "ob.rentalPrice": t.Optional(orderTypeSchema),
      "ob.stockQuantity": t.Optional(orderTypeSchema),
      "ob.categoryName": t.Optional(orderTypeSchema),
      "ob.createdAt": t.Optional(orderTypeSchema),
    }),
    response: t.Object({
      data: t.Array(equipmentSchema),
      meta: t.Object({
        total: t.Number(),
        page: t.Number(),
        pageSize: t.Number(),
        totalPages: t.Number(),
      }),
    }),
    detail: {
      summary: "Get all equipment in inventory",
      operationId: "getEquipments",
    },
  }
);
