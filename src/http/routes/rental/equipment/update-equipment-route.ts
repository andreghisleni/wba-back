import { Prisma } from '@db/client';
import Elysia, { t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

const updateEquipmentBodySchema = t.Object(
  {
    name: t.Optional(t.String()),
    categoryId: t.Optional(t.String({ format: 'uuid' })),
    purchasePrice: t.Optional(t.Number({ minimum: 0 })),
    stockQuantity: t.Optional(t.Number({ minimum: 0 })),
  },
  {
    description: 'Schema for updating equipment',
  }
);

const equipmentParamsSchema = t.Object({
  id: t.String({ format: 'uuid' }),
});

export const updateEquipmentRoute = new Elysia().macro(authMacro).put(
  '/:id',
  async ({ body, params, set }) => {
    const equipment = await prisma.equipment.findUnique({
      where: { id: params.id },
      include: { category: true },
    });

    if (!equipment) {
      set.status = 404;
      return { error: 'Equipment not found' };
    }

    // Preparar dados para atualização
    const dataToUpdate = { ...body };

    // LÓGICA DE RECÁLCULO: Se mudou Preço ou Categoria, recalcula o rentalPrice
    if (body.purchasePrice !== undefined || body.categoryId !== undefined) {
      const priceDecimal =
        body.purchasePrice !== undefined
          ? new Prisma.Decimal(body.purchasePrice)
          : equipment.purchasePrice;

      let rentalPercent = equipment.category.rentalPercent;

      // Se mudou a categoria, busca a nova porcentagem
      if (body.categoryId && body.categoryId !== equipment.categoryId) {
        const newCategory = await prisma.category.findUnique({
          where: { id: body.categoryId },
        });
        if (!newCategory) {
          set.status = 400;
          return { error: 'New Category not found' };
        }
        rentalPercent = newCategory.rentalPercent;
      }

      // Novo Preço de Locação
      dataToUpdate.rentalPrice = priceDecimal.mul(rentalPercent).div(100);
      dataToUpdate.purchasePrice = priceDecimal;
    }

    await prisma.equipment.update({
      where: { id: params.id },
      data: dataToUpdate,
    });

    set.status = 201;
  },
  {
    auth: true,
    params: equipmentParamsSchema,
    body: updateEquipmentBodySchema,
    response: {
      201: t.Void({ description: 'Equipment updated successfully' }),
      404: t.Object({ error: t.String() }),
      400: t.Object({ error: t.String() }),
    },
    detail: {
      summary: 'Update equipment (recalculates rental price if needed)',
      operationId: 'updateEquipment',
    },
  }
);