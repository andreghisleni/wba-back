// src/services/contact-service.ts
import { prisma } from '~/db/client';

/**
 * Gera variações de número de telefone para busca (Com e sem o 9º dígito para BR)
 */
export function getPhoneVariations(phone: string): string[] {
  // 1. Limpa caracteres não numéricos
  const clean = phone.replace(/\D/g, '');

  // Começamos com o número limpo original
  const variations = new Set([clean]);

  // 2. Lógica para Brasil (DDI 55)
  if (clean.startsWith('55')) {
    const ddd = clean.substring(2, 4);
    const body = clean.substring(4);

    // Caso A: Veio COM o 9 (ex: 55 49 9 9938-3783 -> 13 dígitos)
    // Se o corpo tem 9 dígitos e começa com 9, geramos a versão sem o 9
    if (clean.length === 13 && body.startsWith('9')) {
      const withoutNine = `55${ddd}${body.substring(1)}`;
      variations.add(withoutNine);
    }
    // Caso B: Veio SEM o 9 (ex: 55 49 9938-3783 -> 12 dígitos)
    // Se tem 8 dígitos, verificamos se parece celular (começa com 6,7,8,9) para adicionar o 9
    else if (clean.length === 12) {
      const firstDigit = Number.parseInt(body[0], 10);
      // Evita alterar fixos (que começam com 2, 3, 4, 5)
      if (firstDigit >= 6) {
        const withNine = `55${ddd}9${body}`;
        variations.add(withNine);
      }
    }
  }

  return Array.from(variations);
}

/**
 * Procura um contato por qualquer variação do número.
 * Se achar, atualiza. Se não, cria.
 */
export async function upsertSmartContact(data: {
  instanceId: string;
  phoneNumber: string;
  name?: string | null;
  profilePicUrl?: string;
  email?: string;
}) {
  const { instanceId, phoneNumber, name, profilePicUrl, email } = data;

  // 1. Gera lista de números possíveis (ex: com e sem 9)
  const variations = getPhoneVariations(phoneNumber);

  // 2. Busca se JÁ EXISTE algum contato com um desses números nesta instância
  const existingContact = await prisma.contact.findFirst({
    where: {
      instanceId,
      waId: { in: variations }, // O segredo: busca qualquer variação
    },
  });

  // 3. Define qual número salvar (Preferência pelo formato mais longo/com 9 se for criar novo)
  // Se for update, geralmente mantemos o waId que já está lá para não quebrar histórico,
  // ou você pode forçar a atualização para o formato novo aqui.
  const phoneToSave = variations.sort((a, b) => b.length - a.length)[0];

  if (existingContact) {
    // ATUALIZA (UPDATE)
    return await prisma.contact.update({
      where: { id: existingContact.id },
      data: {
        // Só atualiza o nome se foi passado um novo valor
        pushName: name || undefined,
        profilePicUrl: profilePicUrl || undefined,
        email: email || undefined,
        // Opcional: Se quiser padronizar o número no banco ao atualizar:
        waId: phoneToSave
      },
    });
  }
  // CRIA (CREATE)
  return await prisma.contact.create({
    data: {
      instanceId,
      waId: phoneToSave, // Salva a versão "correta" (com 9)
      pushName: name || phoneToSave, // Se não tiver nome, usa o número
      profilePicUrl: profilePicUrl || '',
      email,
    },
  });
}
