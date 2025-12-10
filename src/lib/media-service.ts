import { env } from '~/env';

interface DispatchParams {
  messageId: string;
  mediaUrl: string;
  metaToken: string;
  originalName?: string | null; // <--- Adicionado campo opcional
}

export async function dispatchMediaProcessing(data: DispatchParams) {
  const callbackUrl = `${env.API_PUBLIC_URL}/whatsapp/media-callback`;

  console.log(`📤 Despachando mídia ${data.messageId} (${data.originalName || 'sem-nome'})...`);

  fetch(env.CF_WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.CF_WORKER_SECRET}`
    },
    body: JSON.stringify({
      ...data,
      callbackUrl
    })
  }).catch(err => {
    console.error("❌ Erro ao conectar com Worker:", err);
  });
}