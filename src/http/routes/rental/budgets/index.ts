import Elysia from "elysia";
import { cloneBudgetRoute } from "./clone-budget-route";
import { createBudgetRoute } from "./create-budget-route";
import { getBudgetRoute } from "./get-budget-route";
import { getBudgetsRoute } from "./get-budgets-route";
import { createBudgetItemRoute } from "./items/create-item-route";
import { deleteBudgetItemRoute } from "./items/delete-item-route";
import { updateBudgetItemRoute } from "./items/update-item-route";
import { createBudgetSectionRoute } from "./sections/create-section-route";
import { deleteBudgetSectionRoute } from "./sections/delete-section-route";
import { updateSectionRoute } from "./sections/update-section-route";
import { updateBudgetRoute } from "./update-budget-route";

export const budgetRoutes = new Elysia({
  prefix: "/budgets",
  tags: ["Budgets"],
})
  // Rotas Principais de Orçamento
  .use(createBudgetRoute)
  .use(getBudgetsRoute)
  .use(getBudgetRoute)
  .use(updateBudgetRoute)
  .use(cloneBudgetRoute)

  // Rotas de Seções (Ambientes)
  .use(createBudgetSectionRoute)
  .use(updateSectionRoute)
  .use(deleteBudgetSectionRoute) // <--- Adicionar aqui

  // Rotas de Itens
  .use(createBudgetItemRoute)
  .use(updateBudgetItemRoute)
  .use(deleteBudgetItemRoute); // <--- Adicionar aqui
