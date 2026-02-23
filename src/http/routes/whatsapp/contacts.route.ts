import Elysia, { t } from "elysia";
import { uAuth } from "~/auth";
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
  .use(uAuth)
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
  })
  .patch('/:id/tag', async ({ body, organizationId, set, params }) => {
    const { tagId } = body;

    const contact = await prisma.contact.findUnique({
      where: { id: params.id },
      include: { instance: true },
    });

    if (!contact || contact.instance.organizationId !== organizationId) {
      set.status = 404;
      return { error: 'Contato não encontrado.' };
    }

    if (tagId) {
      const tag = await prisma.tag.findFirst({
        where: {
          id: tagId,
          organizationId,
        },
      });

      if (!tag) {
        set.status = 404;
        return { error: 'Tag não encontrada.' };
      }
    }
    await prisma.contact.update({
      where: { id: params.id },
      data: {
        tagId,
      },
    });

    set.status = 201;
    return { id: params.id };
  }, {
    auth: true,
    body: t.Object({
      tagId: t.Nullable(t.String({ format: 'uuid' })),
    }),
    params: t.Object({
      id: t.String({ format: 'uuid' }),
    }),
    detail: {
      summary: 'Adiciona uma tag a um contato.',
      operationId: 'addTagToContact',
    },
    response: {
      201: t.Object({
        id: t.String(),
      }),
      400: t.Object({
        error: t.String(),
      }),
      404: t.Object({
        error: t.String(),
      }),
    },
  })
  .patch('/:id/tag-kanban', async ({ body, organizationId, set, params }) => {
    const { tagKanbanId } = body;

    const contact = await prisma.contact.findUnique({
      where: { id: params.id },
      include: { instance: true },
    });

    if (!contact || contact.instance.organizationId !== organizationId) {
      set.status = 404;
      return { error: 'Contato não encontrado.' };
    }

    if (tagKanbanId) {
      const tag = await prisma.tag.findFirst({
        where: {
          id: tagKanbanId,
          organizationId,
          type: 'kanban',
        },
      });

      if (!tag) {
        set.status = 404;
        return { error: 'Tag não encontrada.' };
      }
    }

    await prisma.contact.update({
      where: { id: params.id },
      data: {
        tagKanbanId,
      },
    });

    set.status = 201;
    return { id: params.id };
  }, {
    auth: true,
    body: t.Object({
      tagKanbanId: t.Nullable(t.String({ format: 'uuid' })),
    }),
    params: t.Object({
      id: t.String({ format: 'uuid' }),
    }),
    detail: {
      summary: 'Adiciona uma tag kanban a um contato.',
      operationId: 'addTagKanbanToContact',
    },
    response: {
      201: t.Object({
        id: t.String(),
      }),
      400: t.Object({
        error: t.String(),
      }),
      404: t.Object({
        error: t.String(),
      }),
    },
  });