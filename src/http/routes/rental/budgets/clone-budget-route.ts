import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

const cloneBudgetParamsSchema = t.Object({
  budgetId: t.String({ format: "uuid" }), // ID do orçamento original
});

const cloneBudgetBodySchema = t.Object({
  clientName: t.String(),
  eventDate: t.String({ format: "date-time" }),
});

export const cloneBudgetRoute = new Elysia().macro(authMacro).post(
  "/:budgetId/clone",
  async ({ params, body, user, set }) => {
    // 1. Busca o orçamento original com toda a árvore de dados
    const original = await prisma.budget.findUnique({
      where: { id: params.budgetId },
      include: {
        sections: {
          include: { items: true },
        },
      },
    });

    if (!original) {
      set.status = 404;

      return { error: "Not exists" };
    }

    // 2. Criação Otimizada (Deep Copy via Nested Writes)
    // Em vez de 'for', usamos .map() para preparar a estrutura aninhada
    // O Prisma fará os INSERTS em lote automaticamente.
    const newBudget = await prisma.budget.create({
      data: {
        // Cabeçalho
        clientName: body.clientName,
        eventDate: new Date(body.eventDate),
        status: "DRAFT",
        userId: user.id,

        // Copia valores financeiros do original
        totalValue: original.totalValue,
        discount: original.discount,
        laborCost: original.laborCost,
        transportCost: original.transportCost,
        finalValue: original.finalValue,

        // Nested Writes: Cria Seções e Itens em cascata
        sections: {
          create: original.sections.map((section) => ({
            name: section.name,
            // Nested Writes: Cria itens dentro da seção
            items: {
              create: section.items.map((item) => ({
                equipmentId: item.equipmentId,
                quantity: item.quantity,
                unitPrice: item.unitPrice, // Mantém preço original (snapshot)
                subtotal: item.subtotal,
              })),
            },
          })),
        },
      },
    });

    set.status = 201;
    return { id: newBudget.id };
  },
  {
    auth: true,
    params: cloneBudgetParamsSchema,
    body: cloneBudgetBodySchema,
    response: {
      201: t.Object({ id: t.String() }),
      404: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() }), // Caso genérico
    },
    error({ set }) {
      set.status = 500;
      return { error: "Erro ao clonar orçamento" };
    },
    detail: {
      summary: "Clone an existing budget (Deep Copy)",
      operationId: "cloneBudget",
    },
  }
);
