/** biome-ignore-all lint/style/useBlockStatements: <explanation> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
/** biome-ignore-all lint/suspicious/noConsole: <explanation> */
import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";
import { env } from "~/env";

export const whatsappOnboardingRoute = new Elysia().macro(authMacro).post(
  "/onboard",
  async ({ body, user, set }) => {
    const { code } = body;

    try {
      // 1. Trocar o 'code' pelo Access Token do Usuário
      // const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${env.META_APP_ID}&client_secret=${env.META_APP_SECRET}&code=${code}`;
      const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
      tokenUrl.searchParams.append("client_id", env.META_APP_ID);
      tokenUrl.searchParams.append("redirect_uri", 'https://webhooks.andreg.com.br/webhook/oauth/callback');
      tokenUrl.searchParams.append("client_secret", env.META_APP_SECRET);
      tokenUrl.searchParams.append("code", code);
      const tokenRes = await fetch(tokenUrl).then((r) => r.json());

      if (tokenRes.error) throw new Error(tokenRes.error.message);
      const userAccessToken = tokenRes.access_token;

      console.log("User Access Token:", userAccessToken);

      // 2. Descobrir qual WABA (Conta Business) o usuário selecionou
      // Usamos o debug_token para ver as permissões concedidas
      const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${userAccessToken}&access_token=${env.META_APP_ID}|${env.META_APP_SECRET}`;
      console.log("Debug URL:", debugUrl);
      const debugRes = await fetch(debugUrl).then((r) => r.json());

      console.log(debugRes.data.granular_scopes.find(
        (g: any) => g.scope === "whatsapp_business_management"
      ))

      // Achar o ID da WABA nas permissões granulares
      const wabaId = debugRes.data.granular_scopes.find(
        (g: any) => g.scope === "whatsapp_business_management"
      )?.target_ids[0];

      console.log("WABA ID:", wabaId);

      if (!wabaId) throw new Error("Nenhuma conta WhatsApp Business encontrada.");

      // 3. Pegar o número de telefone (Assumindo o primeiro número)
      const phonesUrl = `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${userAccessToken}`;
      const phonesRes = await fetch(phonesUrl).then((r) => r.json());
      const phoneData = phonesRes.data?.[0];

      if (!phoneData) throw new Error("Nenhum número de telefone encontrado na conta.");

      // 4. REGISTRAR O NÚMERO NA API (Isso conecta a API Oficial)
      const registerUrl = `https://graph.facebook.com/v21.0/${phoneData.id}/register`;
      await fetch(registerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userAccessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          pin: "123456", // Em produção, peça isso ao usuário ou gere aleatoriamente
        }),
      });

      // 5. Salvar no Banco de Dados
      // Usamos upsert para atualizar se já existir
      await prisma.whatsAppInstance.upsert({
        where: { phoneNumberId: phoneData.id },
        update: {
          accessToken: userAccessToken,
          status: "ACTIVE",
        },
        create: {
          userId: user.id,
          wabaId,
          phoneNumberId: phoneData.id,
          accessToken: userAccessToken,
          displayNumber: phoneData.display_phone_number,
          businessName: phoneData.verified_name,
          status: "ACTIVE",
        },
      });

      // 6. Inscrever nos Webhooks (para receber mensagens)
      await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
        method: "POST",
        headers: { Authorization: `Bearer ${userAccessToken}` },
        body: JSON.stringify({ messaging_product: "whatsapp" }),
      });

      return { success: true, message: "WhatsApp conectado com sucesso!" };

    } catch (error: any) {
      set.status = 400;
      return { error: error.message || "Falha no onboarding" };
    }
  },
  {
    auth: true, // Protegido pelo Better-Auth
    body: t.Object({
      code: t.String(),
    }),
    detail: {
      summary: "Onboard a WhatsApp Business Account using OAuth2 code.",
      operationId: "whatsappOnboard",
    }
  }
);