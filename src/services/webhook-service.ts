/** biome-ignore-all lint/suspicious/noExplicitAny: i don't have the exact type for payload */
import { prisma } from "~/db/client";

export type WebhookEvent =
  | 'message.received'
  | 'message.sent'
  | 'message.status';

export const webhookService = {
  /**
   * Dispara um evento para todos os webhooks da organização que assinaram esse tópico.
   */
  async dispatch(organizationId: string, event: WebhookEvent, payload: any) {
    // 1. Buscar webhooks ativos desta organização que querem ouvir este evento
    const webhooks = await prisma.webhook.findMany({
      where: {
        organizationId,
        enabled: true,
        events: { has: event } // Filtra quem tem esse evento na lista
      }
    });

    if (!webhooks.length) { return; }

    // 2. Disparar em paralelo (não queremos travar o fluxo principal)
    // Usamos Promise.allSettled para que um erro não pare os outros
    Promise.allSettled(webhooks.map(async (webhook) => {
      const startTime = Date.now();
      let status = 0;
      let responseBody = '';
      let success = false;

      if (payload.wamid && payload.metaEvent) {// buscar esse webhook com o mesmo event e mesmo referenceId e metaEvent para nao duplicar
        // Ex: evitar enviar 2x o webhook de "delivered" para a mesma mensagem
        // Isso pode acontecer se o WhatsApp enviar updates duplicados
        const existingLog = await prisma.webhookLog.findFirst({
          where: {
            webhookId: webhook.id,
            event,
            referenceId: payload.wamid,
            metaEvent: payload.metaEvent
          }
        });

        if (existingLog) {
          // Já existe um log para esse evento + referenceId + metaEvent, então pulamos
          return;
        }
      }

      // 2. Fazer o POST para o URL do webhook

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Boa prática: enviar um header com o ID do evento ou assinatura
            'X-Wba-Event': event,
            'X-Wba-Webhook-Id': webhook.id,
            'X-Wba-Signature': webhook.secret || ''
          },
          body: JSON.stringify({
            event,
            timestamp: new Date().toISOString(),
            data: payload
          })
        });

        status = response.status;
        responseBody = await response.text();
        success = response.ok; // True se status for 200-299

      } catch (error: any) {
        status = 0; // Erro de rede (timeout, DNS, etc)
        responseBody = error.message || 'Network Error';
        success = false;
      }

      // 3. Gravar Log (Assíncrono, fire-and-forget)
      await prisma.webhookLog.create({
        data: {
          webhookId: webhook.id,
          event,
          payload: payload as any,
          responseStatus: status,
          responseBody: responseBody.slice(0, 2000), // Corta para não estourar o banco se for HTML gigante
          duration: Date.now() - startTime,
          success,
          referenceId: payload.wamid || null,
          attempt: 1, // Por enquanto só 1 tentativa por evento
          metaEvent: payload.event || null // Ex: 'delivered', 'read', etc
          // Podemos expandir isso no futuro para rastrear retries, etc.
        }
      });
    }));
  }
};