import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

const deleteItemParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
  budgetId: t.String({ format: "uuid" }),
});

export const deleteBudgetItemRoute = new Elysia().macro(authMacro).delete(
  "/:budgetId/items/:id",
  async ({ params, set }) => {
    // 1. Busca o item para saber o valor a ser estornado
    const item = await prisma.budgetItem.findUnique({
      where: { id: params.id },
      include: { section: true },
    });

    if (!item) {
      set.status = 404;
      return { error: "Item not found" };
    }

    // Segurança: Verificar se o item pertence mesmo ao orçamento da URL
    if (item.section.budgetId !== params.budgetId) {
      set.status = 400;
      return { error: "Item does not belong to the specified budget" };
    }

    const valueToRemove = item.subtotal;

    // 2. Transação: Deleta o item e atualiza o Pai (Orçamento)
    await prisma.$transaction(async (tx) => {
      // Deleta o item
      await tx.budgetItem.delete({
        where: { id: params.id },
      });

      // Atualiza os totais do orçamento
      await tx.budget.update({
        where: { id: params.budgetId },
        data: {
          totalValue: { decrement: valueToRemove },
          finalValue: { decrement: valueToRemove },
        },
      });
    });

    set.status = 204; // No Content
  },
  {
    auth: true,
    params: deleteItemParamsSchema,
    response: {
      204: t.Void({ description: "Item deleted successfully" }),
      404: t.Object({ error: t.String() }),
      400: t.Object({ error: t.String() }),
    },
    detail: {
      summary: "Delete a budget item and update totals",
      operationId: "deleteBudgetItemById",
    },
  }
);
