import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

// Schema para o corpo (Partial permite enviar só o que mudou)
const updateCategoryBodySchema = t.Object(
  {
    name: t.Optional(t.String()),
    rentalPercent: t.Optional(t.Number({ minimum: 0 })),
    description: t.Optional(t.String()),
  },
  {
    description: "Schema for updating a category",
  }
);

const categoryParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

export const updateCategoryRoute = new Elysia().macro(authMacro).put(
  "/:id",
  async ({ body, params, set }) => {
    // Verifica se a categoria existe
    const existingCategory = await prisma.category.findUnique({
      where: { id: params.id },
    });

    if (!existingCategory) {
      set.status = 404;
      return { error: "Category not found" };
    }

    // Se estiver mudando o nome, verifica duplicidade
    if (body.name && body.name !== existingCategory.name) {
      const nameExists = await prisma.category.findUnique({
        where: { name: body.name },
      });
      if (nameExists) {
        set.status = 409;
        return { error: "Category name already exists" };
      }
    }

    await prisma.category.update({
      where: { id: params.id },
      data: body,
    });

    set.status = 201;
  },
  {
    auth: true,
    params: categoryParamsSchema,
    body: updateCategoryBodySchema,
    response: {
      201: t.Void({ description: "Category updated successfully" }),
      404: t.Object({ error: t.String() }),
      409: t.Object({ error: t.String() }),
    },
    detail: {
      summary: "Update an equipment category",
      operationId: "updateCategory",
    },
  }
);
