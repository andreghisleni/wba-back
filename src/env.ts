import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(5).max(100),
  OTEL_TRACE_EXPORTER_URL: z.string(),
  BETTER_AUTH_URL: z.string(),

  META_APP_ID: z.string(),
  META_APP_SECRET: z.string(),
  META_WEBHOOK_VERIFY_TOKEN: z.string(),
  META_CALLBACK_URL: z.url(),
  META_CONFIG_ID: z.string(),

  CF_WORKER_URL: z.url(),     // Ex: http://localhost:8787 ou https://media-worker.sua-conta.workers.dev
  CF_WORKER_SECRET: z.string(),        // A mesma senha que você colocou no wrangler.json
  API_PUBLIC_URL: z.url(),    // A URL pública da sua API (para o callback)

  REDIS_URL: z.string().min(5).max(100),
  GEMINI_API_KEY: z.string().min(10).max(200),
});
// Faz o "parse" das variáveis de ambiente (process.env) usando o schema definido
const parsedEnv = schema.safeParse(process.env);

// Se a validação falhar, lança um erro com detalhes e encerra a aplicação
if (!parsedEnv.success) {
  // biome-ignore lint/suspicious/noConsole: log env errors
  console.error(
    '❌ Variáveis de ambiente inválidas:',
    parsedEnv.error.flatten().fieldErrors
  );

  // Lançar o erro é importante para que a aplicação não inicie com configuração inválida
  throw new Error('Variáveis de ambiente inválidas.');
}

// Exporta as variáveis de ambiente validadas e tipadas
export const env = parsedEnv.data;
