import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

// Schema de Resposta
const categorySchema = t.Object(
  {
    id: t.String({ format: "uuid" }),
    name: t.String(),
    rentalPercent: t.Number(),
    description: t.Optional(t.String()),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  {
    description: "Schema for a single rental category",
  }
);

const categoryParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

export const getCategoryRoute = new Elysia().macro(authMacro).get(
  "/:id",
  async ({ params, set }) => {
    const category = await prisma.category.findUnique({
      where: { id: params.id },
    });

    if (!category) {
      set.status = 404;
      return { error: "Category not found" };
    }

    return { ...category, description: category.description || undefined };
  },
  {
    auth: true,
    params: categoryParamsSchema,
    response: {
      200: categorySchema,
      404: t.Object({ error: t.String() }),
    },
    detail: {
      summary: "Get a category by ID",
      operationId: "getCategoryById",
    },
  }
);
