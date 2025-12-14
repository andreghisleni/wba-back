import { Elysia } from 'elysia';
import { prisma } from '~/db/client';

export const apiKeyMacro = new Elysia().macro({
  // Nome da propriedade que usaremos na rota: { apiKeyAuth: true }
  apiKeyAuth: {
    async resolve({ request: { headers }, set }) {
      const authHeader = headers.get('authorization');

      if (!authHeader?.startsWith('Bearer ')) {
        set.status = 401;
        throw new Error(
          'Token não fornecido. Use o header: Authorization: Bearer sk_...'
        );
      }

      const token = authHeader.slice(7); // Remove o "Bearer "

      // Busca a chave e a organização dona dela
      const apiKey = await prisma.apiKey.findUnique({
        where: { key: token },
        include: { organization: true },
      });

      if (!(apiKey?.enabled)) {
        set.status = 401;
        throw new Error('Token de API inválido ou desativado.');
      }

      // Atualiza o último uso (opcional, mas útil) - fazemos fire-and-forget para não travar
      prisma.apiKey
        .update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() },
        })
        .then();

      // Retorna a organização para ser usada na rota
      return {
        organization: apiKey.organization,
      };
    },
  },
});
