import Elysia, { t } from 'elysia';
import { uAuth } from '~/auth';
import { prisma } from '~/db/client';
import { tagSchema } from './schemas';

export const createTagRoute = new Elysia().use(uAuth).post(
  '/',
  async ({ body, set, organizationId }) => {
    if (!organizationId) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }

    const checkTagName = await prisma.tag.findUnique({
      where: {
        organizationId_name: {
          organizationId,
          name: body.name,
        },
      },
    });

    if (checkTagName) {
      set.status = 404;
      return { error: 'Tag not found' };
    }

    if (body.type !== 'general' && body.type !== 'kanban') {
      set.status = 404;
      return { error: 'Invalid tag type' };
    }

    const tag = await prisma.tag.create({
      data: {
        ...body,
        type: body.type,
        organizationId,
      },
    });

    return tag;
  },
  {
    detail: {
      tags: ['Tags'],
      summary: 'Create a new tag',
      operationId: 'createTag',
    },
    auth: true,
    body: t.Object({
      name: t.String({
        minLength: 3,
        description: 'Name of the tag',
      }),
      colorName: t.String({
        description: 'Color name of the tag',
      }),
      priority: t.Number({
        description: 'Priority of the tag',
      }),
      type: t.String({
        description: 'Type of the tag',
      })
    }),
    response: {
      200: tagSchema,
      404: t.Object(
        {
          error: t.String(),
        },
        { description: 'Creation failed' }
      ),
    },
  }
);
