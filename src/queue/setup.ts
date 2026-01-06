// src/queue/setup.ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '~/env';

// 1. Cria a conexão com o Redis
const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// 2. Cria a instância da Fila (Queue)
// O nome 'whatsapp-error-processing' TEM que ser igual ao do worker
export const metaErrorsQueue = new Queue('whatsapp-error-processing', {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  connection: connection as any,
});