import Elysia, { t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

export const users = new Elysia({
  prefix: '/users',
  name: 'Users',
  tags: ['Users'],
})
  .macro(authMacro)
  .put(
    '/update-last-event/:eventId',
    async ({ user, params }) => {
      const { eventId } = params;

      const existingEvent = await prisma.event.findUnique({
        where: { id: eventId },
      });

      if (!existingEvent) {
        return { error: 'Event not found' };
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastUserEventId: eventId },
      });
    },
    {
      detail: {
        tags: ['Users'],
        summary: 'Update the last event ID for a user',
        operationId: 'updateUserLastEventId',
      },
      auth: true,
      params: t.Object({
        eventId: t.String({
          format: 'uuid',
          description: 'Unique identifier for the event',
        }),
      }),
      response: {
        201: t.Void({ description: "User last event updated successfully" }),
        400: t.Object({
          error: t.String(),
        }, { description: "Event not found" }),
      },
    }
  );
