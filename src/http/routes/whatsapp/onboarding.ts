/** biome-ignore-all lint/style/useBlockStatements: <explanation> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
/** biome-ignore-all lint/suspicious/noConsole: <explanation> */
import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";
import { env } from "~/env";

interface PhoneNumberData {
  id: string;
  display_phone_number: string;
  verified_name: string;
  code_verification_status?: string;
  is_official_business_account?: boolean;
  account_mode?: string;
}

export const whatsappOnboardingRoute = new Elysia().macro(authMacro).post(
  "/onboard",
  async ({ body, organizationId, set }) => {
    const { code } = body;

    if (!organizationId) {
      set.status = 400;
      return { error: "Usuário não pertence a nenhuma organização." };
    }

    try {
      // 1. Trocar o 'code' pelo Access Token do Usuário
      const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
      tokenUrl.searchParams.append("client_id", env.META_APP_ID);
      tokenUrl.searchParams.append("redirect_uri", `${env.META_CALLBACK_URL}/webhook/oauth/callback`);
      tokenUrl.searchParams.append("client_secret", env.META_APP_SECRET);
      tokenUrl.searchParams.append("code", code);
      const tokenRes = await fetch(tokenUrl).then((r) => r.json());

      if (tokenRes.error) throw new Error(tokenRes.error.message);
      const userAccessToken = tokenRes.access_token;

      console.log("User Access Token obtido com sucesso");

      // 2. Descobrir qual WABA (Conta Business) o usuário selecionou
      // Usamos o debug_token para ver as permissões concedidas
      const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${userAccessToken}&access_token=${env.META_APP_ID}|${env.META_APP_SECRET}`;
      const debugRes = await fetch(debugUrl).then((r) => r.json());

      if (debugRes.error) {
        console.error("Erro ao debugar token:", debugRes.error);
        throw new Error("Erro ao validar permissões do token");
      }

      // Achar o ID da WABA nas permissões granulares
      const wabaId = debugRes.data.granular_scopes?.find(
        (g: any) => g.scope === "whatsapp_business_management"
      )?.target_ids?.[0];

      console.log("WABA ID:", wabaId);

      if (!wabaId) throw new Error("Nenhuma conta WhatsApp Business encontrada nas permissões.");

      // 3. Pegar o número de telefone com detalhes para verificar coexistência
      const phonesUrl = `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,is_official_business_account,account_mode&access_token=${userAccessToken}`;
      const phonesRes = await fetch(phonesUrl).then((r) => r.json());

      if (phonesRes.error) {
        console.error("Erro ao buscar números:", phonesRes.error);
        throw new Error("Erro ao buscar números de telefone da conta");
      }

      const phoneData: PhoneNumberData | undefined = phonesRes.data?.[0];

      if (!phoneData) throw new Error("Nenhum número de telefone encontrado na conta.");

      console.log("Phone data:", {
        id: phoneData.id,
        display_phone_number: phoneData.display_phone_number,
        code_verification_status: phoneData.code_verification_status,
        account_mode: phoneData.account_mode,
      });

      // 4. REGISTRAR O NÚMERO NA API (se necessário para coexistência)
      // Verifica se o número precisa ser registrado
      // No modo de coexistência (Embedded Signup v2), o número pode já estar configurado
      const needsRegistration = !phoneData.code_verification_status ||
        phoneData.code_verification_status === 'NOT_VERIFIED';

      if (needsRegistration) {
        console.log("Registrando número na API Cloud...");
        const registerUrl = `https://graph.facebook.com/v21.0/${phoneData.id}/register`;
        const registerRes = await fetch(registerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userAccessToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            pin: crypto.randomUUID().slice(0, 6).replace(/[^0-9]/g, '0').padEnd(6, '0'), // PIN aleatório de 6 dígitos
          }),
        });

        const registerData = await registerRes.json();

        if (registerData.error && !registerData.error.message?.includes('already registered')) {
          console.error("Erro ao registrar:", registerData.error);
          // Não falha se o erro for que já está registrado (coexistência)
          if (!registerData.error.message?.includes('phone number is already registered')) {
            console.warn("Aviso no registro:", registerData.error.message);
          }
        } else {
          console.log("Número registrado com sucesso");
        }
      } else {
        console.log("Número já está verificado, pulando registro (coexistência)");
      }

      // 5. Salvar no Banco de Dados
      // Usamos upsert para atualizar se já existir
      await prisma.whatsAppInstance.upsert({
        where: { phoneNumberId: phoneData.id },
        update: {
          accessToken: userAccessToken,
          status: "ACTIVE",
        },
        create: {
          organizationId,
          wabaId,
          phoneNumberId: phoneData.id,
          accessToken: userAccessToken,
          displayNumber: phoneData.display_phone_number,
          businessName: phoneData.verified_name,
          status: "ACTIVE",
        },
      });

      // 6. Inscrever nos Webhooks (para receber mensagens)
      const subscribeRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userAccessToken}`
        },
        body: JSON.stringify({ messaging_product: "whatsapp" }),
      });

      const subscribeData = await subscribeRes.json();
      if (subscribeData.error) {
        console.warn("Aviso ao inscrever webhooks:", subscribeData.error.message);
      } else {
        console.log("Inscrito nos webhooks com sucesso");
      }

      return {
        success: true,
        message: "WhatsApp conectado com sucesso!",
        coexistenceMode: !needsRegistration,
      };

    } catch (error: any) {
      console.error("Erro no onboarding:", error);
      set.status = 400;
      return { error: error.message || "Falha no onboarding" };
    }
  },
  {
    auth: true,
    body: t.Object({
      code: t.String(),
    }),
    response: {
      200: t.Object({
        success: t.Boolean(),
        message: t.String(),
        coexistenceMode: t.Optional(t.Boolean()),
      }),
      400: t.Object({
        error: t.String(),
      }),
    },
    detail: {
      summary: "Onboard a WhatsApp Business Account using Embedded Signup code.",
      description: "Processa o código de autorização do Embedded Signup da Meta, suportando coexistência com BSPs existentes.",
      operationId: "whatsappOnboard",
    }
  }
);