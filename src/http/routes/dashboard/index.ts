import { Elysia, t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

// Tabela de Preços APROXIMADA (Meta Brasil - BRL)
// Valores de referência. O ideal é ter isso configurável no banco futuramente.
const META_PRICES: Record<string, number> = {
  MARKETING: 0.35,      // ~ R$ 0.35
  UTILITY: 0.20,        // ~ R$ 0.20
  AUTHENTICATION: 0.19, // ~ R$ 0.19
  SERVICE: 0.00         // Primeiras 1000 são grátis, depois cobra. Vamos assumir 0 por enquanto.
};

export const dashboardRoutes = new Elysia({ prefix: '/dashboard' })
  .macro(authMacro)
  .get('/', async ({ organizationId, set }) => {

    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
    });

    if (!instance) {
      set.status = 404;
      return { error: 'Nenhuma instância WhatsApp ativa encontrada para esta organização.' };
    }

    const instanceId = instance.id;

    // 1. Agrupar cobranças por categoria (Marketing, Utility, etc)
    const chargesGrouped = await prisma.conversationCharge.groupBy({
      by: ['category'],
      where: { instanceId },
      _count: {
        category: true
      }
    });

    // 2. Buscar as últimas 10 falhas de envio
    const recentErrors = await prisma.message.findMany({
      where: {
        instanceId,
        status: 'FAILED'
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        contact: {
          select: {
            waId: true,     // O número do telefone (5548...) 
            pushName: true  // O nome do perfil (opcional) [cite: 22]
          }
        },
        errorCode: true,
        errorDesc: true,
        createdAt: true
      }
    });

    // 3. Buscar totais gerais de mensagens
    const totalMessages = await prisma.message.count({
      where: { instanceId }
    });

    // 4. Processar os dados para o Front
    let totalEstimatedCost = 0;

    const usageByType = chargesGrouped.map(item => {
      const count = item._count.category;
      const category = item.category; // MARKETING, UTILITY...
      const cost = count * (META_PRICES[category] || 0);

      totalEstimatedCost += cost;

      return {
        category,
        count,
        cost: Number(cost.toFixed(2))
      };
    });

    return {
      overview: {
        totalMessages,
        totalConversations: usageByType.reduce((acc, curr) => acc + curr.count, 0),
        estimatedCost: Number(totalEstimatedCost.toFixed(2)),
      },
      usageByType, // Para o gráfico de pizza/barra
      recentErrors: recentErrors.map(error => ({
        ...error,
        to: error.contact?.waId || 'Desconhecido',
        errorCode: error.errorCode || undefined,
        errorDesc: error.errorDesc || undefined,
      })), // Para a tabela de alertas
    };
  }, {
    auth: true,
    response: {
      200: t.Object({
        overview: t.Object({
          totalMessages: t.Number(),
          totalConversations: t.Number(),
          estimatedCost: t.Number(),
        }),
        usageByType: t.Array(
          t.Object({
            category: t.String(),
            count: t.Number(),
            cost: t.Number(),
          })
        ),
        recentErrors: t.Array(
          t.Object({
            id: t.String(),
            to: t.String(),
            errorCode: t.Optional(t.String()),
            errorDesc: t.Optional(t.String()),
            createdAt: t.Date(),
          })
        ),
      }),
      404: t.Object({
        error: t.String(),
      }),
      500: t.Object({
        error: t.String(),
      }),
    },
    detail: {
      summary: 'Obtém dados do dashboard para a organização autenticada',
      operationId: 'getDashboardData',
      tags: ['Dashboard'],
    },
  });