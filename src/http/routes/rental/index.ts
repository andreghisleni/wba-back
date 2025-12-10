import Elysia from "elysia";
import { budgetRoutes } from "./budgets";
import { categoriesRoutes } from "./categories";
import { equipmentRoutes } from "./equipment";

export const rentalRoutes = new Elysia({ prefix: "/rental", tags: ["Rental"] })
  .use(categoriesRoutes)
  .use(equipmentRoutes)
  .use(budgetRoutes);
