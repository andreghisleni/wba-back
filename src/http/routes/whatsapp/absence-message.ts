import { Elysia, t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

const AbsenceMessageResponseSchema = t.Object({
  id: t.String(),
  message: t.String(),
  active: t.Boolean(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

const UpsertAbsenceMessageBodySchema = t.Object({
  message: t.String({ minLength: 1 }),
});

const ActivateAbsenceMessageBodySchema = t.Object({
  active: t.Boolean(),
});

export const whatsappAbsenceMessageRoute = new Elysia({
  prefix: '/absence-message',
})
  .macro(authMacro)
  // GET: Buscar mensagem de ausência da organização
  .get('/', async ({ organizationId }) => {
    const msg = await prisma.absenceMessage.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return msg;
  }, {
    auth: true,
    response: t.Nullable(AbsenceMessageResponseSchema),
    detail: { tags: ['Absence Message'], operationId: 'getAbsenceMessage' },
  })
  // POST: Criar ou atualizar mensagem de ausência
  .post('/', async ({ body, organizationId }) => {
    // Busca a última mensagem de ausência da organização
    const lastMsg = await prisma.absenceMessage.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    let msg;
    if (lastMsg) {
      msg = await prisma.absenceMessage.update({
        where: { id: lastMsg.id },
        data: { message: body.message },
      });
    } else {
      msg = await prisma.absenceMessage.create({
        data: { message: body.message, organizationId },
      });
    }
    return msg;
  }, {
    auth: true,
    body: UpsertAbsenceMessageBodySchema,
    response: AbsenceMessageResponseSchema,
    detail: { tags: ['Absence Message'], operationId: 'createOrUpdateAbsenceMessage' },
  })
  // PATCH: Ativar/desativar mensagem de ausência
  .patch('/activate', async ({ body, organizationId }) => {
    // Desativa todas as outras mensagens da organização
    await prisma.absenceMessage.updateMany({
      where: { organizationId },
      data: { active: false },
    });
    // Ativa a última mensagem
    const lastMsg = await prisma.absenceMessage.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastMsg) {
      throw new Error('Nenhuma mensagem de ausência encontrada para ativar.');
    }
    const updated = await prisma.absenceMessage.update({
      where: { id: lastMsg.id },
      data: { active: body.active },
    });
    return updated;
  }, {
    auth: true,
    body: ActivateAbsenceMessageBodySchema,
    response: { 200: AbsenceMessageResponseSchema },
    detail: { tags: ['Absence Message'], operationId: 'activateAbsenceMessage' },
  });
