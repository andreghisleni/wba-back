import type { Prisma } from "@db/client";
import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

export const orderTypeSchema = t.Union([t.Literal("asc"), t.Literal("desc")]);

// Schema para o modelo Budget (Resumo)
const budgetGetSchema = t.Object(
  {
    id: t.String(),
    clientName: t.String(),
    eventDate: t.Date(),
    status: t.String(),
    // Valores monetários (Numbers na API)
    totalValue: t.Number(),
    discount: t.Number(),
    finalValue: t.Number(),
    laborCost: t.Number(),
    transportCost: t.Number(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
    // Opcional: Info de quem criou
    user: t.Object({
      id: t.String(),
      name: t.String(),
    }),
  },
  {
    description: "Schema for budget summary geting",
  }
);

export const getBudgetsRoute = new Elysia().macro(authMacro).get(
  "/",
  async ({ query }) => {
    const orderBy = [
      query?.["ob.clientName"] && { clientName: query?.["ob.clientName"] },
      query?.["ob.eventDate"] && { eventDate: query?.["ob.eventDate"] },
      query?.["ob.status"] && { status: query?.["ob.status"] },
      query?.["ob.finalValue"] && { finalValue: query?.["ob.finalValue"] },
      query?.["ob.createdAt"]
        ? { createdAt: query?.["ob.createdAt"] }
        : { createdAt: "desc" },
    ];

    const orFilters: Prisma.BudgetWhereInput[] = [
      {
        clientName: {
          contains: query?.["f.filter"],
          mode: "insensitive",
        },
      },
      {
        status: {
          contains: query?.["f.filter"],
          mode: "insensitive",
        },
      },
    ];

    const where: Prisma.BudgetWhereInput = {
      OR: query?.["f.filter"] ? orFilters : undefined,
    };

    const [budgets, total] = await prisma.$transaction([
      prisma.budget.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
        take: query?.["p.pageSize"] ?? 20,
        skip:
          ((query?.["p.page"] ?? 1) - 1) * (query?.["p.pageSize"] ?? 20) ||
          undefined,
        orderBy: [...orderBy.filter((o) => o !== undefined)],
      }),
      prisma.budget.count({ where }),
    ]);

    return {
      data: budgets.map((budget) => ({
        ...budget,
        totalValue: budget.totalValue.toNumber(),
        discount: budget.discount.toNumber(),
        laborCost: budget.laborCost.toNumber(),
        transportCost: budget.transportCost.toNumber(),
        finalValue: budget.finalValue.toNumber(),
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
          description: "Filter by client name or status",
        })
      ),
      "p.page": t.Optional(t.Number({ default: 1 })),
      "p.pageSize": t.Optional(t.Number({ default: 20 })),
      // Ordenações
      "ob.clientName": t.Optional(orderTypeSchema),
      "ob.eventDate": t.Optional(orderTypeSchema),
      "ob.status": t.Optional(orderTypeSchema),
      "ob.finalValue": t.Optional(orderTypeSchema),
      "ob.createdAt": t.Optional(orderTypeSchema),
    }),
    response: t.Object({
      data: t.Array(budgetGetSchema),
      meta: t.Object({
        total: t.Number(),
        page: t.Number(),
        pageSize: t.Number(),
        totalPages: t.Number(),
      }),
    }),
    detail: {
      summary: "Get all rental budgets",
      operationId: "getBudgets",
    },
  }
);
