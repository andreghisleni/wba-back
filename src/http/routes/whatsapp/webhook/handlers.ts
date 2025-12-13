// src/http/routes/whatsapp/webhook/handlers.ts
/** biome-ignore-all lint/nursery/noAwaitInLoop: <explanation> */
/** biome-ignore-all lint/suspicious/noConsole: <explanation> */

import { prisma } from '~/db/client';
import type { MessageStatus, MessageType } from '~/db/generated/prisma/enums';
import { dispatchMediaProcessing } from '~/lib/media-service';
import type {
  WhatsAppChange,
  WhatsAppChangeValue,
  WhatsAppMediaContent,
  WhatsAppMessage,
} from './types';

/**
 * Helper para extrair conteúdo de mídia de forma tipada
 */
function getMediaContent(msg: WhatsAppMessage): WhatsAppMediaContent | null {
  switch (msg.type) {
    case 'image':
      return msg.image || null;
    case 'video':
      return msg.video || null;
    case 'audio':
      return msg.audio || null;
    case 'voice':
      return msg.voice || null;
    case 'document':
      return msg.document || null;
    case 'sticker':
      return msg.sticker || null;
    default:
      return null;
  }
}

/**
 * Gerencia a atualização de status (Sent, Delivered, Read, Failed)
 */
async function handleStatusUpdate(value: WhatsAppChangeValue) {
  if (!value.statuses) {
    return;
  }

  for (const statusUpdate of value.statuses) {
    const wamid = statusUpdate.id;
    const newStatus = statusUpdate.status.toUpperCase(); // Tipagem do Prisma geralmente é uppercase

    // timestamp vem como string unix timestamp da Meta
    // const timestamp = BigInt(statusUpdate.timestamp);

    console.log(`🔄 Status Update: ${wamid} -> ${newStatus}`);

    try {
      await prisma.message.updateMany({
        where: { wamid },
        data: {
          status: newStatus as MessageStatus,
          // Se quiser salvar o erro em caso de falha:
          // errorCode: statusUpdate.errors?.[0]?.code?.toString()
        },
      });
    } catch (error) {
      console.error(`❌ Erro ao atualizar status ${wamid}:`, error);
    }
  }
}

/**
 * Gerencia o recebimento de novas mensagens
 */
async function handleIncomingMessage(
  value: WhatsAppChangeValue,
  instanceId: string,
  accessToken: string | null
) {
  if (!value.messages) {
    return;
  }

  const msg = value.messages[0];
  const contact = value.contacts?.[0]; // Info do perfil do contato

  // 1. Criar ou Atualizar Contato
  const dbContact = await prisma.contact.upsert({
    where: {
      instanceId_waId: {
        instanceId,
        waId: msg.from,
      },
    },
    update: {
      pushName: contact?.profile?.name,
    },
    create: {
      instanceId,
      waId: msg.from,
      pushName: contact?.profile?.name,
      profilePicUrl: '',
    },
  });

  const mediaTypes = [
    'image',
    'video',
    'audio',
    'document',
    'sticker',
    'voice',
  ];
  const isMedia = mediaTypes.includes(msg.type);

  // Extrai corpo da mensagem (texto ou legenda da mídia)
  const bodyText =
    msg.text?.body ||
    msg.caption ||
    msg.image?.caption ||
    msg.video?.caption ||
    '';

  // 2. Salvar Mensagem
  // rawJson precisa de cast para 'object' ou 'InputJsonValue' dependendo da config do Prisma,
  // mas como msg é um objeto JS puro, passa direto na maioria dos casos.
  const savedMsg = await prisma.message.create({
    data: {
      wamid: msg.id,
      instanceId,
      contactId: dbContact.id,
      direction: 'INBOUND',
      type: msg.type as MessageType,
      processingStatus: isMedia ? 'PENDING' : 'NONE',
      body: bodyText,
      timestamp: BigInt(msg.timestamp),
      rawJson: msg as unknown as object, // Cast seguro para JSON do Prisma
      status: 'DELIVERED',
    },
  });

  // 3. Processamento de Mídia
  if (isMedia && accessToken) {
    const mediaContent = getMediaContent(msg);

    if (mediaContent) {
      // Prioriza URL direta, senão usa ID para buscar na Graph API
      const targetUrl =
        mediaContent.url ||
        `https://graph.facebook.com/v18.0/${mediaContent.id}`;
      const originalName = mediaContent.filename || null;

      dispatchMediaProcessing({
        messageId: savedMsg.id,
        mediaUrl: targetUrl,
        metaToken: accessToken,
        originalName,
      });
    }
  }
}

/**
 * SWITCH PRINCIPAL TIPO-SEGURO
 */
export async function processWebhookChange(change: WhatsAppChange) {
  const value = change.value;

  // Type Guard simples: se não tem metadata, não é um evento válido pra nós
  if (!value.metadata) {
    return;
  }

  const phoneNumberId = value.metadata.phone_number_id;

  // Busca a instância
  const instance = await prisma.whatsAppInstance.findUnique({
    where: { phoneNumberId },
  });

  if (!instance) {
    console.warn(
      `⚠️ Webhook ignorado: Instância não encontrada para ID ${phoneNumberId}`
    );
    return;
  }

  // Lógica de Despacho
  if (value.statuses && value.statuses.length > 0) {
    await handleStatusUpdate(value);
  } else if (value.messages && value.messages.length > 0) {
    await handleIncomingMessage(value, instance.id, instance.accessToken);
  }
}
