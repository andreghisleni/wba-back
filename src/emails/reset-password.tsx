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

// Props que o componente de e-mail irá receber
interface ResetPasswordEmailProps {
  userName?: string;
  resetLink: string;
}

// Nome da sua empresa ou aplicação
const BRAND_NAME = 'Sua Plataforma';

export const ResetPasswordEmail = ({
  userName = 'Usuário',
  resetLink,
}: ResetPasswordEmailProps) => {
  const previewText = `Redefina sua senha para ${BRAND_NAME}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-gray-100 font-sans">
          <Container className="mx-auto my-10 w-full max-w-lg rounded-lg border border-gray-200 border-solid bg-white p-8">
            <Heading className="mx-0 my-4 p-0 text-center font-bold text-2xl text-black">
              Redefinição de Senha
            </Heading>

            <Section className="my-6">
              <Text className="text-base text-black leading-6">
                Olá, {userName},
              </Text>
              <Text className="text-base text-black leading-6">
                Recebemos uma solicitação para redefinir a senha da sua conta em{' '}
                <strong>{BRAND_NAME}</strong>. Clique no botão abaixo para
                escolher uma nova senha.
              </Text>
            </Section>

            <Section className="mt-6 mb-6 text-center">
              <Button
                className="rounded-md bg-black px-6 py-3 text-center font-semibold text-sm text-white no-underline"
                href={resetLink}
              >
                Redefinir Senha
              </Button>
            </Section>

            <Section className="my-6">
              <Text className="text-base text-black leading-6">
                Se você não solicitou uma redefinição de senha, pode ignorar
                este e-mail com segurança.
              </Text>
              <Text className="text-base text-black leading-6">
                Este link é válido por 1 hora.
              </Text>
            </Section>

            <Hr className="mx-0 my-6 w-full border border-gray-300 border-solid" />

            <Section>
              <Text className="text-gray-600 text-xs">
                Se você está com problemas para clicar no botão "Redefinir
                Senha", copie e cole a URL abaixo no seu navegador:
              </Text>
              <Text className="break-all text-gray-600 text-xs">
                {resetLink}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default ResetPasswordEmail;

ResetPasswordEmail.PreviewProps = {
  userName: 'João',
  resetLink: 'https://sua-plataforma.com/reset-password?token=abc123',
};
