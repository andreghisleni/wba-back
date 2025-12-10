import { Elysia, t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

export const whatsappChatRoute = new Elysia().macro(authMacro)
  // 1. Listar Contatos (Inbox)
  .get("/contacts", async ({ user }) => {
    // Busca contatos apenas das instâncias que pertencem ao usuário logado
    const contacts = await prisma.contact.findMany({
      where: {
        instance: { userId: user.id }
      },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1 // Pega só a última mensagem para exibir na lista
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return contacts.map(c => ({
      id: c.id,
      pushName: c.pushName || c.waId,
      waId: c.waId,
      profilePicUrl: c.profilePicUrl,
      lastMessage: c.messages[0]?.body || "",
      lastMessageAt: c.messages[0] ? new Date(Number(c.messages[0].timestamp) * 1000) : c.updatedAt
    }));
  }, {
    auth: true,
    detail: {
      operationId: "getWhatsappContacts", // <--- Isso define o nome do hook
      tags: ["WhatsApp"]
    }
  })

  // 2. Listar Mensagens de um Contato
  .get("/contacts/:contactId/messages", async ({ params, user, set }) => {
    // Verifica se o contato pertence a uma instância do usuário (Segurança)
    const contact = await prisma.contact.findFirst({
      where: {
        id: params.contactId,
        instance: { userId: user.id }
      }
    });

    if (!contact) {
      set.status = 404;
      return { error: "Contato não encontrado ou sem permissão" };
    }

    const messages = await prisma.message.findMany({
      where: { contactId: params.contactId },
      orderBy: { timestamp: 'asc' }
    });

    return messages.map(m => ({
      id: m.id,
      body: m.body, // Se for imagem, aqui pode ser a legenda
      type: m.type, // 'text', 'image', 'video', etc.
      mediaUrl: m.mediaUrl, // URL da imagem
      direction: m.direction,
      status: m.status,
      timestamp: new Date(Number(m.timestamp) * 1000)
    }));
  }, {
    auth: true,
    params: t.Object({ contactId: t.String() }),
    detail: {
      operationId: "getWhatsappContactsContactIdMessages",
      tags: ["WhatsApp"]
    }
  })

  // 3. Enviar Mensagem (Simples texto)
  .post("/messages", async ({ body, user, set }) => {
    const { contactId, message } = body;

    // Busca dados para envio
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { instance: true }
    });

    if (!contact || contact.instance.userId !== user.id) {
      set.status = 403;
      return { error: "Sem permissão" };
    }

    try {
      // Chama a API da Meta
      const url = `https://graph.facebook.com/v18.0/${contact.instance.phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${contact.instance.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: contact.waId,
          type: "text",
          text: { body: message }
        })
      });

      const responseData = await res.json();

      if (responseData.error) throw new Error(responseData.error.message);

      console.log("Mensagem enviada, resposta da Meta:", responseData);

      // Salva no banco como OUTBOUND
      const savedMsg = await prisma.message.create({
        data: {
          wamid: responseData.messages[0].id,
          contactId: contact.id,
          instanceId: contact.instanceId,
          direction: "OUTBOUND",
          body: message,
          status: "SENT",
          timestamp: BigInt(Math.floor(Date.now() / 1000))
        }
      });

      return { ...savedMsg, timestamp: Number(savedMsg.timestamp) };

    } catch (error: any) {
      set.status = 500;
      return { error: error.message };
    }
  }, {
    auth: true,
    body: t.Object({
      contactId: t.String(),
      message: t.String()
    }),
    detail: {
      operationId: "postWhatsappMessages",
      tags: ["WhatsApp"]
    }
  });