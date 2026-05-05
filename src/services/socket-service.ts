/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import { app } from "~/http/server"; // Importe sua instância do Elysia

export const socketService = {
  /**
   * Envia um evento para todos os usuários conectados na sala da organização.
   */
  broadcast: (organizationId: string, event: string, payload: any) => {
    // O método .publish envia para todos inscritos no tópico
    // Formato: tópico, mensagem (string ou objeto, o Bun serializa auto)
    const topic = `org:${organizationId}`;

    // Verifica se o servidor já subiu
    if (app.server) {
      try {
        const message = JSON.stringify({ event, data: payload });
        app.server.publish(topic, message);
        // biome-ignore lint/suspicious/noConsole: <explanation>
        console.log(`📡 Broadcast para [${topic}]: ${event}`, {
          contactId: payload.contactId,
          messageId: payload.id,
          direction: payload.direction,
        });
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: <explanation>
        console.error(`❌ Erro ao fazer broadcast do evento ${event}:`, error);
        // biome-ignore lint/suspicious/noConsole: <explanation>
        console.error('Payload que causou erro:', payload);
      }
    } else {
      // biome-ignore lint/suspicious/noConsole: <explanation>
      console.warn("⚠️ Tentativa de broadcast antes do servidor iniciar.");
    }
  },
};
