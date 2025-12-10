/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */

import { SES, type SendEmailCommandInput } from '@aws-sdk/client-ses';
import { fromEnv } from '@aws-sdk/credential-providers';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin, openAPI } from 'better-auth/plugins';

import { renderToStaticMarkup } from 'react-dom/server';
import { prisma } from './db/client';
import { ResetPasswordEmail } from './emails/reset-password';
import { env } from './env';

const ses = new SES({
  credentials: process.env.NODE_ENV === 'production' ? fromEnv() : undefined,
  region: 'us-east-2',
});

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    // requireEmailVerification: true,
    async sendResetPassword(data) {
      // biome-ignore lint/suspicious/noConsole: <explanation>
      console.log('Reset password link:', data);

      const html = renderToStaticMarkup(
        ResetPasswordEmail({
          userName: data.user.name ?? undefined,
          resetLink: `${env.BETTER_AUTH_URL}/reset-password/${data.token}?email=${encodeURIComponent(
            data.user.email
          )}`,
        })
      );

      await ses.sendEmail({
        Source: 'envio@andreg.com.br',
        Destination: {
          ToAddresses: [data.user.email],
        },
        Message: {
          Body: {
            Html: {
              Charset: 'UTF-8',
              Data: html,
            },
          },
          Subject: {
            Charset: 'UTF-8',
            Data: 'Verify your email address',
          },
        },
      } satisfies SendEmailCommandInput);

      await Promise.resolve();
    },
  },
  plugins: [admin(), openAPI()],
  basePath: '/api',
  trustedOrigins: ['http://localhost:5173'],
  advanced: {
    database: {
      generateId: false,
    },
  },
  user: {
    additionalFields: {
      image: {
        type: 'string',
        required: false,
      },
      lastUserEventId: {
        type: 'string',
        required: false,
        input: true,
        returned: true,
        description: 'ID of the last event the user interacted with',
      },
    },
  },
});

let _schema: ReturnType<typeof auth.api.generateOpenAPISchema>;
// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
const getSchema = async () => (_schema ??= auth.api.generateOpenAPISchema());

export const OpenAPI = {
  getPaths: (prefix = '/auth/api') =>
    getSchema().then(({ paths }) => {
      const reference: typeof paths = Object.create(null);

      for (const path of Object.keys(paths)) {
        const key = prefix + path;
        reference[key] = paths[path];

        for (const method of Object.keys(paths[path])) {
          const operation = (reference[key] as any)[method];

          operation.tags = ['Better Auth'];
        }
      }

      return reference;
    }) as Promise<any>,
  components: getSchema().then(({ components }) => components) as Promise<any>,
} as const;

export const authMacro = {
  auth: {
    async resolve({ status, request: { headers } }: any) {
      const session = await auth.api.getSession({
        headers,
      });

      // biome-ignore lint/style/useBlockStatements: <explanation>
      if (!session) return status(401);

      return {
        user: session.user,
        session: session.session,
      };
    },
  },
};
