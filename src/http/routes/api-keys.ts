import { randomBytes } from 'node:crypto';
import { Elysia, t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

// --- Schemas Reutilizáveis ---

// Schema da Chave para Listagem (com Key Mascarada)
const ApiKeyListItemSchema = t.Object({
  id: t.String(),
  name: t.String(),
  maskedKey: t.String({ description: 'Ex: sk_live_...a1b2' }),
  enabled: t.Boolean(),
  lastUsedAt: t.Union([t.Date(), t.Null()]),
  createdAt: t.Date(),
});

// Schema da Chave Criada (com Key Completa - só aparece aqui)
const ApiKeyCreatedSchema = t.Object({
  id: t.String(),
  name: t.String(),
  key: t.String({ description: 'O token completo. Exibir apenas uma vez.' }),
  createdAt: t.Date(),
});

export const apiKeysRoutes = new Elysia({ prefix: '/api-keys' })
  .macro(authMacro)

  // --- 1. LISTAR CHAVES ---
  .get(
    '/',
    async ({ organizationId }) => {
      const keys = await prisma.apiKey.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          key: true,
          enabled: true,
          lastUsedAt: true,
          createdAt: true,
        },
      });

      return keys.map((k) => ({
        id: k.id,
        name: k.name,
        maskedKey: `${k.key.substring(0, 12)}...${k.key.substring(k.key.length - 4)}`,
        enabled: k.enabled,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      }));
    },
    {
      auth: true,
      response: {
        200: t.Array(ApiKeyListItemSchema),
      },
      detail: {
        tags: ['API Keys'],
        summary: 'Listar chaves da organização',
        operationId: 'getDashboardApiKeys',
      },
    }
  )

  // --- 2. CRIAR NOVA CHAVE ---
  .post(
    '/',
    async ({ body, organizationId }) => {
      // Gera token: sk_live_ + 24 bytes hex
      const token = `sk_live_${randomBytes(24).toString('hex')}`;

      const newKey = await prisma.apiKey.create({
        data: {
          name: body.name,
          key: token,
          organizationId,
          enabled: true,
        },
      });

      return {
        id: newKey.id,
        name: newKey.name,
        key: newKey.key,
        createdAt: newKey.createdAt,
      };
    },
    {
      auth: true,
      body: t.Object({
        name: t.String({
          minLength: 3,
          description: 'Nome da integração (ex: N8N)',
        }),
      }),
      response: {
        200: ApiKeyCreatedSchema,
        400: t.Object({ error: t.String() }),
      },
      detail: {
        tags: ['API Keys'],
        summary: 'Gerar nova API Key',
        operationId: 'createDashboardApiKey',
      },
    }
  )

  // --- 3. ALTERAR STATUS (Bloquear/Ativar) ---
  .patch(
    '/:id/status',
    async ({ params, body, organizationId, set }) => {
      const apiKey = await prisma.apiKey.findFirst({
        where: { id: params.id, organizationId },
      });

      if (!apiKey) {
        set.status = 404;
        return { error: 'Chave não encontrada.' };
      }

      const updated = await prisma.apiKey.update({
        where: { id: params.id },
        data: { enabled: body.enabled },
      });

      return {
        id: updated.id,
        enabled: updated.enabled,
      };
    },
    {
      auth: true,
      params: t.Object({ id: t.String() }),
      body: t.Object({ enabled: t.Boolean() }),
      response: {
        200: t.Object({
          id: t.String(),
          enabled: t.Boolean(),
        }),
        404: t.Object({ error: t.String() }),
      },
      detail: {
        tags: ['API Keys'],
        summary: 'Ativar ou desativar uma chave',
        operationId: 'updateDashboardApiKeyStatus',
      },
    }
  )

  // --- 4. EXCLUIR CHAVE (Revogar) ---
  .delete(
    '/:id',
    async ({ params, organizationId, set }) => {
      const apiKey = await prisma.apiKey.findFirst({
        where: { id: params.id, organizationId },
      });

      if (!apiKey) {
        set.status = 404;
        return { error: 'Chave não encontrada.' };
      }

      await prisma.apiKey.delete({
        where: { id: params.id },
      });

      return { success: true };
    },
    {
      auth: true,
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        404: t.Object({ error: t.String() }),
      },
      detail: {
        tags: ['API Keys'],
        summary: 'Revogar (deletar) uma chave permanentemente',
        operationId: 'deleteDashboardApiKey',
      },
    }
  );
