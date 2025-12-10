import Elysia from "elysia";
import { createCategoryRoute } from "./create-category-route";
import { getCategoriesRoute } from "./get-categories-route";
import { getCategoryRoute } from "./get-category-route";
import { updateCategoryRoute } from "./update-category-route";

export const categoriesRoutes = new Elysia({
  prefix: "/categories",
  tags: ["Categories"],
})
  .use(createCategoryRoute)
  .use(getCategoriesRoute)
  .use(getCategoryRoute)
  .use(updateCategoryRoute);
