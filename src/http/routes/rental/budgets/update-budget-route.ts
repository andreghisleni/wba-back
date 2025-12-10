import { Prisma } from "@db/client";
import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

const updateBudgetBodySchema = t.Object(
  {
    clientName: t.Optional(t.String()),
    eventDate: t.Optional(t.String({ format: "date-time" })),
    status: t.Optional(t.String()), // DRAFT, APPROVED, etc.
    // Custos Extras e Descontos
    discount: t.Optional(t.Number({ minimum: 0 })),
    laborCost: t.Optional(t.Number({ minimum: 0 })),
    transportCost: t.Optional(t.Number({ minimum: 0 })),
  },
  {
    description: "Schema for updating budget header and extra costs",
  }
);

const budgetParamsSchema = t.Object({
  budgetId: t.String({ format: "uuid" }),
});

export const updateBudgetRoute = new Elysia().macro(authMacro).put(
  "/:budgetId",
  async ({ body, params, set }) => {
    const budget = await prisma.budget.findUnique({
      where: { id: params.budgetId },
    });

    if (!budget) {
      set.status = 404;
      return { error: "Budget not found" };
    }

    // Preparar atualização
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const data: any = {
      clientName: body.clientName,
      status: body.status,
    };

    if (body.eventDate) {
      data.eventDate = new Date(body.eventDate);
    }

    // LÓGICA DE RECÁLCULO DO FINAL VALUE
    // Final = TotalItems (não muda aqui) + Labor + Transport - Discount
    let shouldRecalculate = false;
    let newLabor = budget.laborCost;
    let newTransport = budget.transportCost;
    let newDiscount = budget.discount;

    if (body.laborCost !== undefined) {
      newLabor = new Prisma.Decimal(body.laborCost);
      data.laborCost = newLabor;
      shouldRecalculate = true;
    }
    if (body.transportCost !== undefined) {
      newTransport = new Prisma.Decimal(body.transportCost);
      data.transportCost = newTransport;
      shouldRecalculate = true;
    }
    if (body.discount !== undefined) {
      newDiscount = new Prisma.Decimal(body.discount);
      data.discount = newDiscount;
      shouldRecalculate = true;
    }

    if (shouldRecalculate) {
      data.finalValue = budget.totalValue
        .add(newLabor)
        .add(newTransport)
        .sub(newDiscount);
    }

    await prisma.budget.update({
      where: { id: params.budgetId },
      data,
    });

    set.status = 201;
  },
  {
    auth: true,
    params: budgetParamsSchema,
    body: updateBudgetBodySchema,
    response: {
      201: t.Void({ description: "Budget updated successfully" }),
      404: t.Object({ error: t.String() }),
    },
    detail: {
      summary: "Update budget details and recalculate final value",
      operationId: "updateBudget",
    },
  }
);
