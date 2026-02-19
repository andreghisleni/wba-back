import Elysia, { t } from "elysia";
import { uAuth } from "~/auth";
import { prisma } from "~/db/client";
import { tagSchema } from "./schemas";

export const updateTagRoute = new Elysia().use(uAuth).post(
  "/:id",
  async ({ body, set, params, organizationId }) => {
    const checkTag = await prisma.tag.findUnique({
      where: {
        id: params.id,
      },
    });

    if (!checkTag || checkTag.organizationId !== organizationId) {
      set.status = 404;
      return { error: "Tag not found" };
    }

    if (checkTag.name !== body.name) {
      const checkTagName = await prisma.tag.findFirst({
        where: {
          id: {
            not: params.id,
          },
          organizationId,
          name: body.name,
        },
      });

      if (checkTagName) {
        set.status = 400;
        return { error: "Tag name already exists" };
      }
    }


    const tag = await prisma.tag.update({
      where: {
        id: params.id,
      },
      data: {
        ...body,
      },
    });

    return tag;
  },
  {
    detail: {
      tags: ["Tags"],
      summary: "Update a tag",
      operationId: "updateTag",
    },
    auth: true,
    params: t.Object({
      id: t.String({ format: "uuid" }),
    }),
    body: t.Object({
      name: t.String({
        minLength: 3,
        description: "Name of the tag",
      }),
      colorName: t.String({
        minLength: 1,
        description: "Color of the tag",
      }),
      priority: t.Number({
        description: "Priority of the tag, lower number means higher priority",
      }),
    }),
    response: {
      200: tagSchema,
      404: t.Object(
        {
          error: t.String(),
        },
        { description: "Tag not found" },
      ),
      400: t.Object(
        {
          error: t.String(),
        },
        { description: "Tag name already exists" },
      ),
    },
  },
);
