import { PrismaClient } from '@db/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '~/env';
import { Decimal } from './generated/prisma/internal/prismaNamespace';

// --- CONFIGURAÇÃO GLOBAL DE DECIMAL ---
// Isso garante que ao enviar um JSON (respostas da API),
// o Prisma converta objetos Decimal para números simples (JavaScript Number).
// Evita que o frontend receba strings ou objetos complexos.
// @ts-expect-error
Decimal.prototype.toJSON = function () {
  return Number(this.toString());
};

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
})

export const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
  adapter,
});
