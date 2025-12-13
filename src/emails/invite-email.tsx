import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
// biome-ignore lint/correctness/noUnusedImports: needed for JSX
import React from 'react';

interface InviteEmailProps {
  userName?: string;
  inviteLink: string;
  organizationName?: string;
}

const BRAND_NAME = 'WBA (WhatsApp Business API)';

export const InviteEmail = ({
  userName = 'Usuário',
  inviteLink,
  organizationName = 'sua organização',
}: InviteEmailProps) => {
  const previewText = `Você foi convidado para ${organizationName} no ${BRAND_NAME}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-gray-100 font-sans">
          <Container className="mx-auto my-10 w-full max-w-lg rounded-lg border border-gray-200 border-solid bg-white p-8">
            <Heading className="mx-0 my-4 p-0 text-center font-bold text-2xl text-black">
              Convite para {organizationName}
            </Heading>

            <Section className="my-6">
              <Text className="text-base text-black leading-6">
                Olá, {userName},
              </Text>
              <Text className="text-base text-black leading-6">
                Você foi convidado para participar da organização <strong>{organizationName}</strong> na <strong>{BRAND_NAME}</strong>.
                Clique no botão abaixo para aceitar o convite e criar sua conta.
              </Text>
            </Section>

            <Section className="mt-6 mb-6 text-center">
              <Button
                className="rounded-md bg-black px-6 py-3 text-center font-semibold text-sm text-white no-underline"
                href={inviteLink}
              >
                Aceitar Convite
              </Button>
            </Section>

            <Section className="my-6">
              <Text className="text-base text-black leading-6">
                Se você não esperava este convite, pode ignorar este e-mail com segurança.
              </Text>
              <Text className="text-base text-black leading-6">
                Este link é válido por 48 horas.
              </Text>
            </Section>

            <Hr className="mx-0 my-6 w-full border border-gray-300 border-solid" />

            <Section>
              <Text className="text-gray-600 text-xs">
                Se você está com problemas para clicar no botão "Aceitar Convite", copie e cole a URL abaixo no seu navegador:
              </Text>
              <Text className="break-all text-gray-600 text-xs">
                {inviteLink}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default InviteEmail;

InviteEmail.PreviewProps = {
  userName: 'Maria',
  inviteLink: 'https://sua-plataforma.com/invite?token=xyz789',
  organizationName: 'Minha Empresa',
};
