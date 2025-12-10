import Elysia, { t } from "elysia";
import { prisma } from "~/db/client";
import { env } from "~/env";
import { dispatchMediaProcessing } from "~/lib/media-service";

export const whatsappWebhookRoute = new Elysia({ prefix: "/webhook" })
  // 1. Verificação (A Meta chama isso quando você configura o webhook)
  .get("/", ({ query, set }) => {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (mode === "subscribe") {// && token === env.META_WEBHOOK_VERIFY_TOKEN
      return challenge; // Retorna o desafio em texto puro
    }

    set.status = 403;
    return "Forbidden";
  })
  // 2. Recebimento de Mensagens
  .post("/", async ({ body, set }) => {
    const payload = body as any;

    // Verificar se é um evento do WhatsApp
    if (payload.object === "whatsapp_business_account") {
      for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;

          if (value.messages) {
            const msg = value.messages[0];
            const contact = value.contacts?.[0];
            const phoneNumberId = value.metadata.phone_number_id;

            // Achar a instância no nosso banco
            const instance = await prisma.whatsAppInstance.findUnique({
              where: { phoneNumberId },
            });

            if (instance) {
              // 1. Criar ou Atualizar Contato
              const dbContact = await prisma.contact.upsert({
                where: {
                  instanceId_waId: {
                    instanceId: instance.id,
                    waId: msg.from,
                  },
                },
                update: { pushName: contact?.profile?.name },
                create: {
                  instanceId: instance.id,
                  waId: msg.from,
                  pushName: contact?.profile?.name,
                },
              });

              const mediaTypes = ["image", "video", "audio", "document", "sticker", "voice"];
              const isMedia = mediaTypes.includes(msg.type);

              // 2. Salvar Mensagem
              const savedMsg = await prisma.message.create({
                data: {
                  wamid: msg.id,
                  instanceId: instance.id,
                  contactId: dbContact.id,
                  direction: "INBOUND",
                  type: msg.type, // text, image, etc.]
                  processingStatus: isMedia ? "PENDING" : "NONE",
                  body: msg.text?.body || msg.caption || "",
                  timestamp: BigInt(msg.timestamp),
                  rawJson: msg, // Guardamos o JSON original por segurança
                  status: "DELIVERED",
                },
              });

              // 3. Se for mídia, despacha para a Cloudflare
              if (isMedia && instance.accessToken) {
                // O objeto pode ser msg.image, msg.document, etc.
                const mediaContent = (msg as any)[msg.type];

                // Priorizamos a URL direta, fallback para ID
                const targetUrl = mediaContent?.url || `https://graph.facebook.com/v18.0/${mediaContent?.id}`;

                // Tenta pegar o nome original (Documentos geralmente têm isso)
                const originalName = mediaContent?.filename || null;

                if (targetUrl) {
                  dispatchMediaProcessing({
                    messageId: savedMsg.id,
                    mediaUrl: targetUrl,
                    metaToken: instance.accessToken,
                    originalName: originalName // <--- Passando o nome
                  });
                }
              }
            }
          }
        }
      }
      return "OK";
    }

    set.status = 404;
    return "Not Found";
  });