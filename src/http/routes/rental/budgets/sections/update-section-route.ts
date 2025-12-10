import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

const sectionParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
  budgetId: t.String({ format: "uuid" }),
});

const updateSectionBodySchema = t.Object({
  name: t.String(),
});

export const updateSectionRoute = new Elysia().macro(authMacro).put(
  "/:budgetId/sections/:id",
  async ({ body, params, set }) => {
    const section = await prisma.budgetSection.findUnique({
      where: { id: params.id },
    });

    if (!section || section.budgetId !== params.budgetId) {
      set.status = 404;
      return { error: "Section not found in this budget" };
    }

    await prisma.budgetSection.update({
      where: { id: params.id },
      data: { name: body.name },
    });

    set.status = 201;
  },
  {
    auth: true,
    params: sectionParamsSchema,
    body: updateSectionBodySchema,
    response: {
      201: t.Void({ description: "Section updated successfully" }),
      404: t.Object({ error: t.String() }),
    },
    detail: {
      summary: "Update budget section name",
      operationId: "updateBudgetSection",
    },
  }
);
