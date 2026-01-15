import Elysia from 'elysia';
import { whatsappAbsenceMessageRoute } from './absence-message';
import { broadcastRoutes } from './broadcast';
import { whatsappChatRoute } from './chat';
import { mediaCallbackRoute } from './media-callback';
import { whatsappOauthLinkRoute } from './oauth-link';
import { whatsappOnboardingRoute } from './onboarding';
import { whatsappTemplatesRoute } from './templates';
import { whatsappWebhookRoute } from './webhook';

export const whatsappRoutes = new Elysia({
  prefix: '/whatsapp',
  tags: ['WhatsApp'],
})
  .use(whatsappOnboardingRoute)
  .use(whatsappWebhookRoute)
  .use(whatsappChatRoute)
  .use(mediaCallbackRoute)
  .use(whatsappTemplatesRoute)
  .use(whatsappOauthLinkRoute)

  // Nova rota de mensagem de ausência
  .use(whatsappAbsenceMessageRoute)
  .use(broadcastRoutes);
