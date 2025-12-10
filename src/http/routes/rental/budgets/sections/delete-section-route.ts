import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

const deleteSectionParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
  budgetId: t.String({ format: "uuid" }),
});

export const deleteBudgetSectionRoute = new Elysia().macro(authMacro).delete(
  "/:budgetId/sections/:id",
  async ({ params, set }) => {
    // 1. Busca a seção e soma os valores dos itens dentro dela
    const section = await prisma.budgetSection.findUnique({
      where: { id: params.id },
      include: {
        items: { select: { subtotal: true } }, // Pegamos apenas os subtotais
      },
    });

    if (!section) {
      set.status = 404;
      return { error: "Section not found" };
    }

    if (section.budgetId !== params.budgetId) {
      set.status = 400;
      return { error: "Section does not belong to the specified budget" };
    }

    // Calcula o valor total que será removido do orçamento
    // (Somatória de todos os itens desta seção)
    // const totalSectionValue = section.items.reduce((acc, item) => {
    //   return acc.add(item.subtotal); // Usando Decimal.add
    // }, new prisma.budgetSection.fields.items.model.fields.subtotal.type(0));
    // Nota: O reduce acima é conceitual para Decimal.
    // Como estamos usando o hack do client.ts, o JS pode tratar como number,
    // mas a forma segura no reduce com array de objetos do prisma é:
    const valueToRemove = section.items.reduce(
      (acc, curr) => acc + Number(curr.subtotal),
      0
    );

    // 2. Transação
    await prisma.$transaction(async (tx) => {
      // O "onDelete: Cascade" do Prisma Schema já cuidaria dos itens,
      // mas precisamos atualizar o valor do orçamento ANTES ou DEPOIS.

      // Deletamos a seção (os itens somem por cascata no banco)
      await tx.budgetSection.delete({
        where: { id: params.id },
      });

      // Atualizamos o cabeçalho do orçamento
      if (valueToRemove > 0) {
        await tx.budget.update({
          where: { id: params.budgetId },
          data: {
            totalValue: { decrement: valueToRemove },
            finalValue: { decrement: valueToRemove },
          },
        });
      }
    });

    set.status = 204;
  },
  {
    auth: true,
    params: deleteSectionParamsSchema,
    response: {
      204: t.Void({ description: "Section deleted successfully" }),
      404: t.Object({ error: t.String() }),
      400: t.Object({ error: t.String() }),
    },
    detail: {
      summary: "Delete a budget section and all its items",
      operationId: "deleteBudgetSectionById",
    },
  }
);
