/** biome-ignore-all lint/suspicious/noConsole: <explanation> */
/** biome-ignore-all lint/complexity/useLiteralKeys: <explanation> */
import Elysia, { t } from "elysia";
import { prisma } from "~/db/client";
import { env } from "~/env";

export const mediaCallbackRoute = new Elysia()
  .post("/media-callback", async ({ body, headers, set }) => {
    // 1. Segurança: Verifica se quem chama é realmente nosso Worker
    const auth = headers['authorization'];
    if (auth !== `Bearer ${env.CF_WORKER_SECRET}`) {
      set.status = 401;
      return "Unauthorized";
    }

    const { messageId, status, publicUrl, fileName, error } = body;

    console.log(`📥 Callback recebido para msg ${messageId}: ${status}, ${fileName}`);

    try {
      if (status === 'COMPLETED') {
        await prisma.message.update({
          where: { id: messageId },
          data: {
            mediaUrl: publicUrl,
            processingStatus: 'COMPLETED'
          }
        });
      } else {
        // Se falhou, marcamos como FAILED para não ficar loading eterno
        await prisma.message.update({
          where: { id: messageId },
          data: {
            processingStatus: 'FAILED',
            body: error ? `Erro no upload: ${error}` : undefined
          }
        });
      }
    } catch (err) {
      console.error("Erro ao atualizar status da mensagem via callback", err);
      set.status = 500;
      return "Internal Error";
    }

    return { success: true };
  }, {
    body: t.Object({
      messageId: t.String(),
      status: t.String(),
      publicUrl: t.Optional(t.String()),
      fileName: t.Optional(t.String()),
      error: t.Optional(t.String())
    })
  });