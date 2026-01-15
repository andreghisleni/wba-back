import Elysia, { t } from "elysia";
import { authMacro } from "~/auth";
import { prisma } from "~/db/client";

const contactSchema = t.Object({
  id: t.String(),
  name: t.Nullable(t.String()),
  phone: t.String(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export const getContactsRoute = new Elysia({
  prefix: '/contacts',
})
  .macro(authMacro)
  .get('/', async ({ organizationId, set }) => {
    // 1. Valida e seleciona a instância
    // Se o front não mandar instanceId, tentamos pegar a primeira conectada do usuário
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { organizationId },
    });

    if (!instance) {
      set.status = 400;
      return { error: 'Nenhuma instância disponível para criar o contato.' };
    };

    const contacts = await prisma.contact.findMany({
      where: { instanceId: instance.id },
    });

    return contacts.map(contact => ({
      id: contact.id,
      name: contact.pushName,
      phone: contact.waId,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    }));
  }, {
    auth: true,
    detail: {
      summary: 'Recupera todos os contatos da instância.',
      operationId: 'getContacts',
    },
    response: {
      200: t.Array(contactSchema),
      400: t.Object({
        error: t.String(),
      }),
    },
  });