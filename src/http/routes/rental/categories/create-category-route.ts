import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

const createCategoryBodySchema = t.Object(
  {
    name: t.String(),
    rentalPercent: t.Number({ minimum: 0 }), // Ex: 4.0
    description: t.Optional(t.String()),
  },
  {
    description: "Schema for creating a new equipment category",
  }
);

export const createCategoryRoute = new Elysia().macro(authMacro).post(
  "/",
  async ({ body, set }) => {
    const existing = await prisma.category.findUnique({
      where: { name: body.name },
    });

    if (existing) {
      set.status = 409;
      return { error: "Category with this name already exists" };
    }

    await prisma.category.create({
      data: {
        name: body.name,
        rentalPercent: body.rentalPercent,
        description: body.description,
      },
    });

    set.status = 201;
  },
  {
    auth: true,
    body: createCategoryBodySchema,
    response: {
      201: t.Void({ description: "Category created successfully" }),
      409: t.Object({ error: t.String() }),
    },
    detail: {
      summary: "Create a new equipment category",
      operationId: "createCategory",
    },
  }
);
