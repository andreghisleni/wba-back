import { t } from "elysia";

export const tagSchema = t.Object({
  id: t.String({ format: "uuid" }),
  name: t.String(),
  colorName: t.String(),
  priority: t.Number(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});
