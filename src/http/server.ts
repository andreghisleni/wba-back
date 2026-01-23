import cors from '@elysiajs/cors';
import swagger from '@elysiajs/swagger';
import { Elysia, t } from 'elysia';
import { auth } from '~/auth';
import { env } from '~/env';
import { tracing } from '~/tracing';
import { apiKeysRoutes } from './routes/api-keys';
import { dashboardRoutes } from './routes/dashboard';
import { externalApiRoutes } from './routes/external-api';
import { sendMessagesWithErrorToWebhookRoutes } from './routes/send-messages-with-error-to-webhook';
import { webhookRoutes } from './routes/webhooks';
// import { event } from "./routes/event-routes";
// import { events } from "./routes/events";
import { whatsappRoutes } from './routes/whatsapp';

// import { scoutSessions } from "./routes/scout-sessions";
// import { users } from "./routes/users";

export const app = new Elysia()
  .use(tracing)
  .use(
    cors({
      origin: env.BETTER_AUTH_URL,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  )
  // .use(
  //   openapi({
  //     path: '/docs2',
  //     documentation: {
  //       info: {
  //         title: 'Vortex API',
  //         version: '1.0.0',
  //       },
  //     },
  //     mapJsonSchema: {
  //       zod: z.toJSONSchema,
  //     },
  //   })
  // )
  .use(
    swagger({
      path: '/docs',
      documentation: {
        info: {
          title: 'WBA',
          version: '1.0.0',
        },
        // components: await OpenAPI.components,
        // paths: await OpenAPI.getPaths(),
      },
    })
  )
  .mount(auth.handler)
  .use(sendMessagesWithErrorToWebhookRoutes)
  .use(webhookRoutes)
  .use(apiKeysRoutes)
  .use(externalApiRoutes)
  .use(dashboardRoutes)
  .use(whatsappRoutes)
  .get('/', () => 'Hello Elysia', {
    detail: {
      summary: 'API Health Check',
      description: 'Returns a simple greeting to verify the API is running',
      operationId: 'healthCheck',
    },
    response: {
      200: t.String({ description: 'API greeting message' }),
    },
  })
  .listen({
    hostname: '0.0.0.0',
    port: env.PORT,
  });

// biome-ignore lint/suspicious/noConsole: show port and hostname
console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
