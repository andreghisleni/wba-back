import Elysia, { t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

const createBudgetBodySchema = t.Object(
  {
    clientName: t.String({
      description: 'Name of the client for the budget',
    }),
    eventDate: t.Date({ description: 'Date of the event' }),
  },
  {
    description: 'Schema for creating a new budget header',
  }
);

export const createBudgetRoute = new Elysia().macro(authMacro).post(
  '/',
  async ({ body, user, set }) => {
    const budget = await prisma.budget.create({
      data: {
        clientName: body.clientName,
        eventDate: body.eventDate,
        status: 'DRAFT',
        userId: user.id,
      },
    });

    set.status = 201;
    return { id: budget.id };
  },
  {
    auth: true,
    body: createBudgetBodySchema,
    response: {
      201: t.Object({ id: t.String() }, { description: 'Budget ID returned' }),
    },
    detail: {
      summary: 'Create a new budget header',
      operationId: 'createBudget',
    },
  }
);