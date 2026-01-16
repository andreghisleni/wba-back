// src/queue/broadcast-worker.ts
/** biome-ignore-all lint/suspicious/noConsole: <explanation> */
/* eslint-disable no-console */

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '~/db/client';
import { env } from '~/env';
import type { BroadcastJobData } from './broadcast-setup';

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const queueName = 'broadcast-campaign';

interface TemplateComponent {
  type: string;
  parameters?: Array<{
    type: string;
    text?: string;
    payload?: string;
  }>;
  sub_type?: string;
  index?: string;
}

const worker = new Worker<BroadcastJobData>(
  queueName,
  async (job) => {
    const {
      campaignId,
      memberId,
      contactId,
      contactWaId,
      instanceId,
      templateId,
      templateName,
      templateLanguage,
      bodyValues,
      buttonValues,
    } = job.data;

    console.log(
      `📤 Processando envio: Campanha ${campaignId} -> Contato ${contactWaId}`
    );

    // 1. Busca a instância para pegar o token
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new Error(`Instância ${instanceId} não encontrada`);
    }

    // 2. Busca o template para montar o payload
    const template = await prisma.template.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error(`Template ${templateId} não encontrado`);
    }

    // 3. Monta os componentes do template com os parâmetros
    const components: TemplateComponent[] = [];

    // Preenche variáveis do CORPO (Body)
    if (bodyValues && bodyValues.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyValues.map((value) => ({
          type: 'text',
          text: value,
        })),
      });
    }

    // Preenche variáveis de BOTÕES (Buttons)
    if (buttonValues && buttonValues.length > 0) {
      for (const btn of buttonValues) {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: String(btn.index),
          parameters: [
            {
              type: 'text',
              text: btn.value,
            },
          ],
        });
      }
    }

    // 4. Monta o payload para a Meta
    const metaPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: contactWaId,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components: components.length > 0 ? components : undefined,
      },
    };

    // 5. Envia para a Meta
    const url = `https://graph.facebook.com/v21.0/${instance.phoneNumberId}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${instance.accessToken}`,
      },
      body: JSON.stringify(metaPayload),
    });

    const responseData = (await res.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message: string; code: number };
    };

    // 6. Trata erro da API
    if (responseData.error) {
      console.error(
        `❌ Erro ao enviar para ${contactWaId}: ${responseData.error.message}`
      );

      // Atualiza contador de falhas na campanha
      await prisma.broadcastCampaign.update({
        where: { id: campaignId },
        data: { failedCount: { increment: 1 } },
      });

      // Salva a mensagem com status de erro
      await prisma.message.create({
        data: {
          wamid: `failed-${campaignId}-${memberId}-${Date.now()}`,
          contactId,
          instanceId,
          direction: 'OUTBOUND',
          body: `Template: ${templateName}`,
          type: 'template',
          status: 'FAILED',
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
          errorCode: String(responseData.error.code),
          errorDesc: responseData.error.message,
          broadcastCampaignId: campaignId,
          templateParams: {
            templateId,
            templateName,
            language: templateLanguage,
            bodyParams: bodyValues ?? [],
            buttonParams: buttonValues ?? [],
          },
        },
      });

      throw new Error(responseData.error.message);
    }

    // 7. Sucesso - salva a mensagem
    const wamid = responseData.messages?.[0]?.id;

    if (!wamid) {
      throw new Error('Resposta da Meta não contém ID da mensagem');
    }

    await prisma.message.create({
      data: {
        wamid,
        contactId,
        instanceId,
        direction: 'OUTBOUND',
        body: `Template: ${templateName}`,
        type: 'template',
        status: 'SENT',
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        broadcastCampaignId: campaignId,
        templateParams: {
          templateId,
          templateName,
          language: templateLanguage,
          bodyParams: bodyValues ?? [],
          buttonParams: buttonValues ?? [],
        },
      },
    });

    // 8. Atualiza contador de enviados na campanha
    await prisma.broadcastCampaign.update({
      where: { id: campaignId },
      data: { sentCount: { increment: 1 } },
    });

    console.log(`✅ Mensagem enviada: ${wamid} -> ${contactWaId}`);

    return { wamid, contactWaId };
  },
  {
    connection: connection as never,
    concurrency: 5, // Processa até 5 jobs simultaneamente
    limiter: {
      max: 80, // Máximo 80 mensagens por minuto (limite da Meta é ~80/s, mas vamos ser conservadores)
      duration: 60_000,
    },
  }
);

// Evento: Job completado
worker.on('completed', (job) => {
  console.log(`✓ Job ${job.id} concluído`);
});

// Evento: Job falhou
worker.on('failed', (job, err) => {
  console.error(`✗ Job ${job?.id} falhou: ${err.message}`);
});

// Evento: Worker pronto
worker.on('ready', () => {
  console.log(`🚀 Broadcast Worker iniciado, ouvindo a fila "${queueName}"...`);
});

// Evento: Erro no worker
worker.on('error', (err) => {
  console.error('Erro no worker:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Recebido SIGTERM, fechando worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Recebido SIGINT, fechando worker...');
  await worker.close();
  process.exit(0);
});

console.log(`🚀 Broadcast Worker iniciado, ouvindo a fila "${queueName}"...`);
