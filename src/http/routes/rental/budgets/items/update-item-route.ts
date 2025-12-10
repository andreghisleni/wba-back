import { Prisma } from '@db/client';
import Elysia, { t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

const itemParamsSchema = t.Object({
  id: t.String({ format: 'uuid' }), // ID do Item
  budgetId: t.String({ format: 'uuid' }), // ID do Orçamento (para segurança)
});

const updateItemBodySchema = t.Object(
  {
    quantity: t.Optional(t.Number({ minimum: 1 })),
    customUnitPrice: t.Optional(t.Number({ minimum: 0 })),
  },
  {
    description: 'Schema for updating a budget item',
  }
);

export const updateBudgetItemRoute = new Elysia().macro(authMacro).put(
  '/:budgetId/items/:id',
  async ({ body, params, set }) => {
    // 1. Busca Item, Seção e Orçamento
    const item = await prisma.budgetItem.findUnique({
      where: { id: params.id },
      include: {
        section: { include: { budget: true } },
      },
    });

    if (!item) {
      set.status = 404;
      return { error: 'Item not found' };
    }

    if (item.section.budgetId !== params.budgetId) {
      set.status = 400;
      return { error: 'Item does not belong to this budget' };
    }

    // Se nada mudou, retorna
    if (body.quantity === undefined && body.customUnitPrice === undefined) {
      set.status = 201;
      return;
    }

    const oldSubtotal = item.subtotal;

    // 2. Novos valores
    const newQuantity =
      body.quantity !== undefined ? body.quantity : item.quantity;
    const newUnitPrice =
      body.customUnitPrice !== undefined
        ? new Prisma.Decimal(body.customUnitPrice)
        : item.unitPrice;

    const newSubtotal = newUnitPrice.mul(newQuantity);
    const delta = newSubtotal.sub(oldSubtotal); // Diferença para ajustar no total

    // 3. Transação para manter consistência
    await prisma.$transaction(async (tx) => {
      // Atualiza o item
      await tx.budgetItem.update({
        where: { id: params.id },
        data: {
          quantity: newQuantity,
          unitPrice: newUnitPrice,
          subtotal: newSubtotal,
        },
      });

      // Atualiza o Orçamento Pai (TotalItems e FinalValue)
      await tx.budget.update({
        where: { id: params.budgetId },
        data: {
          totalValue: { increment: delta },
          finalValue: { increment: delta },
        },
      });
    });

    set.status = 201;
  },
  {
    auth: true,
    params: itemParamsSchema,
    body: updateItemBodySchema,
    response: {
      201: t.Void({ description: 'Item updated and budget totals adjusted' }),
      404: t.Object({ error: t.String() }),
      400: t.Object({ error: t.String() }),
    },
    detail: {
      summary: 'Update budget item quantity/price and sync totals',
      operationId: 'updateBudgetItem',
    },
  }
);
