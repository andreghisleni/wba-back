// src/http/routes/whatsapp/webhook/handlers.ts
/** biome-ignore-all lint/nursery/noAwaitInLoop: <explanation> */
/** biome-ignore-all lint/suspicious/noConsole: <explanation> */

import { prisma } from '~/db/client';
import type { MessageStatus, MessageType } from '~/db/generated/prisma/enums';
import { dispatchMediaProcessing } from '~/lib/media-service';
import { metaErrorsQueue } from '~/queue/setup';
import { upsertSmartContact } from '~/services/contact-service';
import { webhookService } from '~/services/webhook-service';
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
export async function handleStatusUpdate(
  value: WhatsAppChangeValue,
  instanceId: string
) {
  if (!value.statuses) {
    return;
  }

  // console.log(`📨 Atualização de Status: ${value.statuses.length} msgs.`);

  for (const statusUpdate of value.statuses) {
    const wamid = statusUpdate.id;
    // O status original (sent, delivered, read) é útil para o payload do webhook
    const rawStatus = statusUpdate.status;
    const newStatus = rawStatus.toUpperCase(); // STATUS DO BANCO (ENUM)
    const timestamp = BigInt(statusUpdate.timestamp);
    const recipientId = statusUpdate.recipient_id; // Importante para o webhook

    // console.log(`🔄 Status: ${newStatus} | Msg: ${wamid}`);

    // 1. DADOS DE COBRANÇA
    if (statusUpdate.pricing) {
      const { category } = statusUpdate.pricing;
      try {
        await prisma.conversationCharge.create({
          data: {
            wamid,
            category: category.toUpperCase(), // InstanceId já vem nos args da função
            instance: { connect: { id: instanceId } }, // Conexão segura via relation
            timestamp,
            // Precisamos do conversationId se estiver no schema, se não, pode omitir
            // conversationId: statusUpdate.conversation?.id || '',
          },
        });
        // console.log(`💰 Cobrança: ${category.toUpperCase()}`);
      } catch (e) {
        console.error('Erro ao salvar cobrança:', e);
      }
    }

    // 2. DADOS DE ERRO
    let errorData = {};
    if (
      newStatus === 'FAILED' &&
      statusUpdate.errors &&
      statusUpdate.errors.length > 0
    ) {
      const err = statusUpdate.errors[0];
      errorData = {
        errorCode: err.code.toString(),
        errorDesc: err.message, // Ex: "Payment method not configured"
      };
      console.error(`❌ Falha na mensagem ${wamid}: ${err.message}`);
    }

    // 3. ATUALIZAÇÃO DA MENSAGEM + WEBHOOK
    try {
      const mss = await prisma.message.findUnique({
        where: { wamid },
      });

      if (!mss) {
        throw new Error('Mensagem não encontrada');
      }

      // Trocamos updateMany por UPDATE para poder pegar o retorno (organizationId)
      // Como wamid é @unique no schema, isso funciona perfeitamente.
      const updatedMessage = await prisma.message.update({
        where: { wamid },
        data: {
          status: newStatus as MessageStatus, // Cast para o Enum do Prisma
          ...errorData,
        },
        include: {
          instance: true, // <--- NECESSÁRIO: Pega a organização para o webhook
        },
      });

      try {
        if (updatedMessage.status === 'READ' && updatedMessage.broadcastCampaignId) {
          await prisma.broadcastCampaign.update({
            where: { id: updatedMessage.broadcastCampaignId },
            data: {
              readCount: { increment: 1 },
            },
          });
        }
      } catch (e) {
        console.error('Erro ao atualizar readCount da campanha:', e);
      }

      if (updatedMessage.status === 'FAILED') {
        // 2. Joga para a fila processar a IA e o Vínculo
        // Importante: passamos o ID interno do banco (updatedMsg.id)
        await metaErrorsQueue.add('analyze-error', {
          messageId: updatedMessage.id,
          errorCode: updatedMessage.errorCode,
          errorDesc: updatedMessage.errorDesc,
        });
      }

      // 4. DISPARAR WEBHOOK (A Novidade)
      if (updatedMessage?.instance) {
        await webhookService.dispatch(
          updatedMessage.instance.organizationId,
          'message.status',
          {
            event: rawStatus, // 'sent', 'delivered', 'read', 'failed'
            wamid: updatedMessage.wamid,
            to: recipientId,
            // Converte timestamp unix (segundos) para ISO Date String legível
            timestamp: new Date(
              Number(statusUpdate.timestamp) * 1000
            ).toISOString(),
            error: Object.keys(errorData).length > 0 ? errorData : null,
          }
        );

        // console.log(`🪝 Webhook de status disparado: ${rawStatus}`);
      }
    } catch {
      // Se der erro no update (ex: mensagem antiga não encontrada no banco),
      // apenas logamos e seguimos vida.
      console.warn(`Msg ${wamid} não encontrada para atualização.`);
    }
  }
}

/**
 * Gerencia o recebimento de novas mensagens
 */
async function handleIncomingMessage(
  value: WhatsAppChangeValue,
  instanceId: string,
  organizationId: string,
  accessToken: string | null,
  instancePhoneNumberId: string
) {
  if (!value.messages) {
    return;
  }

  const msg = value.messages[0];
  const contact = value.contacts?.[0]; // Info do perfil do contato

  // 1. Criar ou Atualizar Contato
  const dbContact = await upsertSmartContact({
    instanceId,
    phoneNumber: msg.from, // O número que veio no webhook
    name: contact?.profile?.name, // Nome do perfil do WhatsApp
    // profilePicUrl: ... (se tiver essa info disponível no futuro)
  });

  // await prisma.contact.upsert({
  //   where: {
  //     instanceId_waId: {
  //       instanceId,
  //       waId: msg.from,
  //     },
  //   },
  //   update: {
  //     pushName: contact?.profile?.name,
  //   },
  //   create: {
  //     instanceId,
  //     waId: msg.from,
  //     pushName: contact?.profile?.name,
  //     profilePicUrl: '',
  //   },
  // });

  const mediaTypes = [
    'image',
    'video',
    'audio',
    'document',
    'sticker',
    'voice',
  ];
  const isMedia = mediaTypes.includes(msg.type);

  // Normaliza tipos de mensagem para os suportados pelo banco
  const validMessageTypes = [
    'text',
    'image',
    'video',
    'audio',
    'voice',
    'document',
    'sticker',
    'reaction',
    'button',
    'interactive',
    'template',
    'unsupported',
    'unknown',
  ];
  const normalizedType = validMessageTypes.includes(msg.type) ? msg.type : 'unknown';

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
  // O campo context (se presente) contém a referência à mensagem sendo respondida
  const savedMsg = await prisma.message.create({
    data: {
      wamid: msg.id,
      instanceId,
      contactId: dbContact.id,
      direction: 'INBOUND',
      type: normalizedType as MessageType,
      processingStatus: isMedia ? 'PENDING' : 'NONE',
      body: bodyText,
      timestamp: BigInt(msg.timestamp),
      rawJson: msg as unknown as object, // Cast seguro para JSON do Prisma (inclui context se for reply)
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

  // 4. Resposta automática de ausência, se estiver ativa
  const absence = await prisma.absenceMessage.findFirst({
    where: { organizationId, active: true },
    orderBy: { createdAt: 'desc' },
  });

  // console.log(`🤖 Verificando ausência automática para org ${organizationId}...`);
  // console.log(absence);

  if (absence && accessToken) {
    // console.log('⏰ Enviando mensagem de ausência automática...');
    // Envia mensagem de ausência via WhatsApp Cloud API
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${instancePhoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: msg.from,
          recipient_type: 'individual',
          type: 'text',
          text: {
            body: absence.message,
            preview_url: false,
          },
        }),
      }
    );

    // Tenta extrair o wamid da resposta
    let wamid: string | undefined;
    try {
      const data = await resp.json();
      wamid = data?.messages?.[0]?.id;
    } catch {
      console.warn('Não foi possível extrair o wamid da resposta de ausência.');
    }
    // Salva a mensagem de ausência como OUTBOUND
    if (wamid) {
      await prisma.message.create({
        data: {
          wamid,
          instanceId,
          contactId: dbContact.id,
          direction: 'OUTBOUND',
          type: 'text',
          processingStatus: 'NONE',
          body: absence.message,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
          rawJson: {},
          status: 'SENT',
        },
      });
    }
  }

  webhookService.dispatch(organizationId, 'message.received', {
    messageId: savedMsg.id,
    wamid: savedMsg.wamid,
    from: dbContact.waId,
    type: savedMsg.type,
    body: savedMsg.body,
    mediaUrl: savedMsg.mediaUrl, // Se tiver
    contact: {
      name: dbContact.pushName,
      phone: dbContact.waId,
    },
    // Contexto de resposta (quando é uma reply)
    replyTo: msg.context ? {
      wamid: msg.context.id,
      from: msg.context.from,
    } : null,
  });
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
    await handleStatusUpdate(value, instance.id);
  } else if (value.messages && value.messages.length > 0) {
    await handleIncomingMessage(
      value,
      instance.id,
      instance.organizationId,
      instance.accessToken,
      instance.phoneNumberId
    );
  }
}
