import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

const budgetParamsSchema = t.Object({
  budgetId: t.String({ format: "uuid" }),
});

const createSectionBodySchema = t.Object(
  {
    name: t.String(),
  },
  {
    description: "Schema for creating a section inside a budget",
  }
);

export const createBudgetSectionRoute = new Elysia().macro(authMacro).post(
  "/:budgetId/sections",
  async ({ body, params, set }) => {
    const budget = await prisma.budget.findUnique({
      where: { id: params.budgetId },
    });

    if (!budget) {
      set.status = 404;
      return { error: "Budget not found" };
    }

    const section = await prisma.budgetSection.create({
      data: {
        name: body.name,
        budgetId: params.budgetId,
      },
    });

    set.status = 201;
    return { id: section.id };
  },
  {
    auth: true,
    params: budgetParamsSchema,
    body: createSectionBodySchema,
    response: {
      201: t.Object({ id: t.String() }),
      404: t.Object({ error: t.String() }),
    },
    detail: {
      summary: "Add a section (environment) to a budget",
      operationId: "createBudgetSection",
    },
  }
);
