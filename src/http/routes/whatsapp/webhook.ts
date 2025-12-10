import Elysia, { t } from "elysia";
import { prisma } from "~/db/client";
import { env } from "~/env";

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

              // 2. Salvar Mensagem
              await prisma.message.create({
                data: {
                  wamid: msg.id,
                  instanceId: instance.id,
                  contactId: dbContact.id,
                  direction: "INBOUND",
                  type: msg.type, // text, image, etc.
                  body: msg.text?.body || msg.caption || "",
                  timestamp: BigInt(msg.timestamp),
                  rawJson: msg, // Guardamos o JSON original por segurança
                  status: "DELIVERED",
                },
              });
            }
          }
        }
      }
      return "OK";
    }

    set.status = 404;
    return "Not Found";
  });