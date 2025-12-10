import Elysia from "elysia";
import { whatsappOnboardingRoute } from "./onboarding";
import { whatsappWebhookRoute } from "./webhook";
import { whatsappChatRoute } from "./chat";
import { whatsappAuthRoutes } from "./auth";
import { mediaCallbackRoute } from "./media-callback";

export const whatsappRoutes = new Elysia({
  prefix: "/whatsapp",
  tags: ["WhatsApp"],
})
  .use(whatsappOnboardingRoute)
  .use(whatsappWebhookRoute)
  .use(whatsappChatRoute)
  .use(whatsappAuthRoutes)
  .use(mediaCallbackRoute);