import Elysia, { t } from "elysia";
import { uAuth } from "~/auth";
import { tagSchema } from "./schemas";
import { prisma } from "~/db/client";

export const createTagRoute = new Elysia().use(uAuth).post(
  "/",
  async ({ body, set, organizationId }) => {
    const checkTagName = await prisma.tag.findUnique({
      where: {
        organizationId_name: {
          organizationId,
          name: body.name,
        }
      },
    });

    if (checkTagName) {
      set.status = 404;
      return { error: "Tag not found" };
    }

    const tag = await prisma.tag.create({
      data: {
        ...body,
        organizationId,
      },
    });

    return tag;
  },
  {
    detail: {
      tags: ["Tags"],
      summary: "Create a new tag",
      operationId: "createTag",
    },
    auth: true,
    body: t.Object({
      name: t.String({
        minLength: 3,
        description: "Name of the tag",
      }),
      colorName: t.String({
        minLength: 1,
        description: "Color name of the tag",
      }),
      priority: t.Number({
        description: "Priority of the tag",
      }),
    }),
    response: {
      200: tagSchema,
      404: t.Object(
        {
          error: t.String(),
        },
        { description: "Creation failed" },
      ),
    },
  },
);
