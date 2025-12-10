import { Prisma } from '@db/client';
import Elysia, { t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

const createEquipmentBodySchema = t.Object(
  {
    name: t.String(),
    categoryId: t.String({ format: 'uuid' }),
    purchasePrice: t.Number({ minimum: 0 }),
    stockQuantity: t.Number({ minimum: 0 }),
  },
  {
    description: 'Schema for creating a new equipment',
  }
);

export const createEquipmentRoute = new Elysia().macro(authMacro).post(
  '/',
  async ({ body, set }) => {
    const category = await prisma.category.findUnique({
      where: { id: body.categoryId },
    });

    if (!category) {
      set.status = 404;
      return { error: 'Category not found' };
    }

    // Converter input number para Decimal para cálculo preciso
    const purchasePriceDecimal = new Prisma.Decimal(body.purchasePrice);

    // Cálculo: Preço * (Percentual / 100)
    const rentalPriceCalculated = purchasePriceDecimal
      .mul(category.rentalPercent)
      .div(100);

    await prisma.equipment.create({
      data: {
        name: body.name,
        categoryId: body.categoryId,
        stockQuantity: body.stockQuantity,
        purchasePrice: purchasePriceDecimal,
        rentalPrice: rentalPriceCalculated,
      },
    });

    set.status = 201;
  },
  {
    auth: true,
    body: createEquipmentBodySchema,
    response: {
      201: t.Void({ description: 'Equipment created successfully' }),
      404: t.Object({ error: t.String() }),
    },
    detail: {
      summary: 'Create a new equipment with auto-calculated rental price',
      operationId: 'createEquipment',
    },
  }
);
