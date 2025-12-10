import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

// Schema dos Itens (Nível 3)
const budgetItemSchema = t.Object({
  id: t.String(),
  quantity: t.Number(),
  unitPrice: t.Number(),
  subtotal: t.Number(),
  equipment: t.Object({
    id: t.String(),
    name: t.String(),
    category: t.Optional(t.Object({ name: t.String() })),
  }),
});

// Schema das Seções (Nível 2)
const budgetSectionSchema = t.Object({
  id: t.String(),
  name: t.String(),
  items: t.Array(budgetItemSchema),
});

// Schema do Orçamento (Nível 1 - Raiz)
const budgetSchema = t.Object(
  {
    id: t.String({ format: "uuid" }),
    clientName: t.String(),
    eventDate: t.Date(),
    status: t.String(),
    totalValue: t.Number(),
    discount: t.Number(),
    laborCost: t.Number(),
    transportCost: t.Number(),
    finalValue: t.Number(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
    // Geta de Ambientes/Seções
    sections: t.Array(budgetSectionSchema),
  },
  {
    description: "Schema for a complete budget with sections and items",
  }
);

const budgetParamsSchema = t.Object({
  budgetId: t.String({ format: "uuid" }),
});

export const getBudgetRoute = new Elysia().macro(authMacro).get(
  "/:budgetId",
  async ({ params, set }) => {
    const budget = await prisma.budget.findUnique({
      where: { id: params.budgetId },
      include: {
        sections: {
          orderBy: { name: "asc" }, // Opcional: ordenar seções
          include: {
            items: {
              include: {
                equipment: {
                  include: { category: true }, // Para mostrar nome e categoria no front
                },
              },
              orderBy: [
                { equipment: { categoryId: "asc" } },
                { equipment: { name: "asc" } },
              ], // Opcional: ordenar itens
            },
          },
        },
      },
    });

    if (!budget) {
      set.status = 404;
      return { error: "Budget not found" };
    }

    return {
      ...budget,
      totalValue: budget.totalValue.toNumber(),
      discount: budget.discount.toNumber(),
      laborCost: budget.laborCost.toNumber(),
      transportCost: budget.transportCost.toNumber(),
      finalValue: budget.finalValue.toNumber(),
      sections: budget.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({
          ...item,
          unitPrice: item.unitPrice.toNumber(),
          subtotal: item.subtotal.toNumber(),
        })),
      })),
    };
  },
  {
    auth: true,
    params: budgetParamsSchema,
    response: {
      200: budgetSchema,
      404: t.Object({ error: t.String() }),
    },
    detail: {
      summary: "Get full budget details by ID",
      operationId: "getBudgetById",
    },
  }
);
