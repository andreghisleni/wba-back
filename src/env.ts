import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(5).max(100),
  OTEL_TRACE_EXPORTER_URL: z.string(),
  BETTER_AUTH_URL: z.string(),
});
// Faz o "parse" das variáveis de ambiente (process.env) usando o schema definido
const parsedEnv = schema.safeParse(process.env);

// Se a validação falhar, lança um erro com detalhes e encerra a aplicação
if (!parsedEnv.success) {
  // biome-ignore lint/suspicious/noConsole: <explanation>
  console.error(
    '❌ Variáveis de ambiente inválidas:',
    parsedEnv.error.flatten().fieldErrors
  );

  // Lançar o erro é importante para que a aplicação não inicie com configuração inválida
  throw new Error('Variáveis de ambiente inválidas.');
}

// Exporta as variáveis de ambiente validadas e tipadas
export const env = parsedEnv.data;
