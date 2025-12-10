import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

const equipmentSchema = t.Object(
  {
    id: t.String({ format: "uuid" }),
    name: t.String(),
    categoryId: t.String(),
    // Inclui dados da categoria aninhados
    category: t.Object({
      id: t.String(),
      name: t.String(),
      rentalPercent: t.Number(),
    }),
    purchasePrice: t.Number(),
    rentalPrice: t.Nullable(t.Number()),
    stockQuantity: t.Number(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  {
    description: "Schema for a single equipment with category",
  }
);

const equipmentParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

export const getEquipmentRoute = new Elysia().macro(authMacro).get(
  "/:id",
  async ({ params, set }) => {
    const equipment = await prisma.equipment.findUnique({
      where: { id: params.id },
      include: {
        category: true, // Join com Categoria
      },
    });

    if (!equipment) {
      set.status = 404;
      return { error: "Equipment not found" };
    }

    return {
      ...equipment,
      purchasePrice: equipment.purchasePrice.toNumber(),
      rentalPrice: equipment.rentalPrice?.toNumber() || 0,
      category: {
        ...equipment.category,
        description: equipment.category.description || undefined,
      },
    };
  },
  {
    auth: true,
    params: equipmentParamsSchema,
    response: {
      200: equipmentSchema,
      404: t.Object({ error: t.String() }),
    },
    detail: {
      summary: "Get an equipment by ID",
      operationId: "getEquipmentById",
    },
  }
);
