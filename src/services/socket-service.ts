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
      app.server.publish(topic, JSON.stringify({ event, data: payload }));
      // console.log(`📡 Broadcast para [${topic}]: ${event}`);
    } else {
      // biome-ignore lint/suspicious/noConsole: <explanation>
      console.warn("⚠️ Tentativa de broadcast antes do servidor iniciar.");
    }
  },
};
