// src/http/routes/whatsapp/webhook/index.ts
/** biome-ignore-all lint/nursery/noAwaitInLoop: <explanation> */

import Elysia from 'elysia';
import { processWebhookChange } from './handlers';
import type { WhatsAppWebhookPayload } from './types';

export const whatsappWebhookRoute = new Elysia({ prefix: '/webhook' })

  // 1. Verificação (GET)
  .get('/', ({ query, set }) => {
    const mode = query['hub.mode'];
    const challenge = query['hub.challenge'];
    // const token = query['hub.verify_token'];

    if (mode === 'subscribe') {
      // Validação de token aqui se necessário
      return challenge;
    }

    set.status = 403;
    return 'Forbidden';
  })

  // 2. Recebimento (POST)
  .post('/', async ({ body, set }) => {
    // Cast seguro: Assumimos que a Meta manda o formato correto.
    // Se quiser validar runtime, use o 'body: t.Object(...)' do Elysia.
    const payload = body as WhatsAppWebhookPayload;

    if (payload.object === 'whatsapp_business_account') {

      // Itera com segurança usando Optional Chaining e Arrays vazios por padrão
      for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
          await processWebhookChange(change);
        }
      }

      return 'OK';
    }

    set.status = 404;
    return 'Not Found';
  });