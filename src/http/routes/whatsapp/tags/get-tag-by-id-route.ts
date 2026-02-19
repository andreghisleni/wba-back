import Elysia, { t } from "elysia";
import { uAuth } from "~/auth";
import { prisma } from "~/db/client";
import { tagSchema } from "./schemas";

export const getTagByIdRoute = new Elysia().use(uAuth).get(
  "/:id",
  async ({ params, set }) => {
    const tag = await prisma.tag.findUnique({
      where: { id: params.id },
    });
    if (!tag) {
      set.status = 404;
      return {
        error: "Tag not found",
      };
    }
    return tag;
  },
  {
    auth: true,
    detail: {
      tags: ["Tags"],
      summary: "Get tag by ID",
      operationId: "getTagById",
    },
    params: t.Object({
      id: t.String({ format: "uuid" }),
    }),
    response: {
      200: tagSchema,
      404: t.Object(
        {
          error: t.String(),
        },
        { description: "Tag not found" },
      ),
    },
  },
);
