import Elysia from 'elysia';
import { whatsappChatRoute } from './chat';
import { mediaCallbackRoute } from './media-callback';
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
  .use(whatsappTemplatesRoute);
