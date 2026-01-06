// src/queue/error-worker.ts
/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
/** biome-ignore-all lint/suspicious/noConsole: <explanation> */

import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '~/db/client';
import { env } from '~/env';

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

// Inicializa a nova biblioteca
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const queueName = 'whatsapp-error-processing';

const worker = new Worker(
  queueName,
  async (job) => {
    const { messageId, errorCode, errorDesc } = job.data;

    console.log(`🔧 Processando erro da Msg ID: ${messageId}`);

    const cleanDesc = errorDesc?.trim() || '';
    const hashString = `${errorCode}|${cleanDesc}`;
    const errorHash = createHash('sha256').update(hashString).digest('hex');

    // Tenta achar no banco
    let definition = await prisma.errorDefinition.findUnique({
      where: { hash: errorHash },
    });

    // Se NÃO existe, chama o Gemini
    if (!definition) {
      console.log(`🤖 Erro inédito (${errorCode}). Chamando Gemini...`);

      let aiResponse = { short: 'Erro em análise.', detailed: 'Sem detalhes.' };

      try {
        const prompt = `
        Erro do WhatsApp Business API.
        Código: ${errorCode}
        Mensagem: "${cleanDesc}"
        
        Gere um JSON (pt-BR):
        {
          "short": "Explicação para leigo (max 15 palavras)",
          "detailed": "Explicação técnica e solução (max 1 parágrafo)"
        }
        `;

        // --- MUDANÇA AQUI: Sintaxe da nova SDK ---
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash', // Use o modelo flash atual (o 2.5 ainda pode não estar disponível em GA)
          contents: prompt,
          config: {
            responseMimeType: 'application/json', // Força o retorno em JSON
          },
        });

        // Na nova SDK, response.text pode ser uma função ou propriedade dependendo da versão exata.
        // O padrão seguro é tratar como string ou chamar se for função.
        const rawText =/** typeof response.text === 'function' ? response.text() : */ response.text;

        if (rawText) {
          const text = rawText.replace(/```json|```/g, '').trim();
          aiResponse = JSON.parse(text);
        }

      } catch (e: any) {
        console.error('Falha na IA:', e?.message || e);
        // Não damos throw para não travar a fila, salvamos o erro genérico
      }

      // Cria a definição no banco
      definition = await prisma.errorDefinition.create({
        data: {
          hash: errorHash,
          metaCode: String(errorCode),
          rawMessage: cleanDesc,
          shortExplanation: aiResponse.short,
          detailedExplanation: aiResponse.detailed,
        },
      });
    }

    // Vincula a mensagem
    await prisma.message.update({
      where: { id: messageId },
      data: {
        errorDefinitionId: definition.id,
      },
    });

    console.log(`✅ Mensagem vinculada ao erro: ${definition.id}`);
  },
  {
    connection: connection as any,
    limiter: {
      max: 10,
      duration: 60_000,
    },
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} concluído.`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} falhou: ${err.message}`);
});

console.log(`🚀 Worker de erros iniciado, ouvindo a fila "${queueName}"...`);