import type { InputJsonObject } from '@prisma/client/runtime/client';
import { Elysia, t } from 'elysia';
import { authMacro } from '~/auth';
import { prisma } from '~/db/client';

// --- 1. INTERFACES TYPESCRIPT (Lógica Interna) ---

interface MetaAPIResponse {
  id: string;
  status: string;
  category: string;
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}

interface MetaButtonObj {
  type: 'URL' | 'PHONE_NUMBER' | 'QUICK_REPLY';
  text: string;
  url?: string;
  example?: string[];
}

interface MetaComponent {
  type: 'BODY' | 'FOOTER' | 'BUTTONS' | 'HEADER';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  text?: string;
  example?: {
    body_text?: string[][];
    header_text?: string[];
    header_handle?: string[];
  };
  buttons?: MetaButtonObj[];
}

// Interface para um item da lista de templates vinda da Meta
interface MetaTemplateItem {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: MetaComponent[]; // Reaproveitamos a interface que já criamos
}

// Interface da resposta da listagem (com paginação)
interface MetaTemplateListResponse {
  data: MetaTemplateItem[];
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
  };
  error?: { message: string };
}

const ImportResponseSchema = t.Object({
  status: t.Number(),
  data: t.Object({
    total: t.Number(),
    imported: t.Number(),
    message: t.String(),
  }),
});

// --- 2. SCHEMAS ELYSIA (Validação) ---

// Componentes dentro do JSON
const MetaComponentSchema = t.Object({
  type: t.Union([
    t.Literal('BODY'),
    t.Literal('FOOTER'),
    t.Literal('BUTTONS'),
    t.Literal('HEADER'),
  ]),
  format: t.Optional(
    t.Union([
      t.Literal('TEXT'),
      t.Literal('IMAGE'),
      t.Literal('VIDEO'),
      t.Literal('DOCUMENT'),
      t.Literal('LOCATION'),
    ])
  ),
  text: t.Optional(t.String()),
  example: t.Optional(
    t.Object({
      body_text: t.Optional(t.Array(t.Array(t.String()))),
      header_text: t.Optional(t.Array(t.String())),
      header_handle: t.Optional(t.Array(t.String())),
    })
  ),
  buttons: t.Optional(
    t.Array(
      t.Object({
        type: t.Union([
          t.Literal('URL'),
          t.Literal('PHONE_NUMBER'),
          t.Literal('QUICK_REPLY'),
        ]),
        text: t.String(),
        url: t.Optional(t.String()),
        example: t.Optional(t.Array(t.String())),
      })
    )
  ),
});

// Resposta de Sucesso (O Template)
export const TemplateResponseSchema = t.Object({
  id: t.String(),
  wamid: t.Nullable(t.String()),
  name: t.String(),
  category: t.String(),
  body: t.String(),
  status: t.String(),
  structure: t.Nullable(t.Array(MetaComponentSchema)),
  instanceId: t.String(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
  language: t.String(),
});

// Resposta de Erro
const ErrorResponseSchema = t.Object({
  error: t.String(),
});

// Payload de Criação
const CreateTemplateBodySchema = t.Object({
  name: t.String({ pattern: '^[a-z0-9_]+$' }),
  category: t.Enum({
    MARKETING: 'MARKETING',
    UTILITY: 'UTILITY',
    AUTHENTICATION: 'AUTHENTICATION',
  }),
  // Header fields
  headerFormat: t.Optional(
    t.Enum({
      NONE: 'NONE',
      TEXT: 'TEXT',
      IMAGE: 'IMAGE',
      VIDEO: 'VIDEO',
      DOCUMENT: 'DOCUMENT',
    })
  ),
  headerText: t.Optional(t.String({ maxLength: 60 })),
  exampleHeader: t.Optional(t.Array(t.String())),
  // Body fields
  bodyText: t.String({ minLength: 1 }),
  footerText: t.Optional(t.String()),
  bodyExamples: t.Optional(t.Array(t.String())),
  buttons: t.Optional(
    t.Array(
      t.Object({
        text: t.String(),
        url: t.String(),
      })
    )
  ),
  buttonExamples: t.Optional(t.Array(t.String())),
});

// const UpdateTemplateBodySchema = t.Object({
//   category: t.Enum({
//     MARKETING: 'MARKETING',
//     UTILITY: 'UTILITY',
//     AUTHENTICATION: 'AUTHENTICATION',
//   }),
//   // Opcional: Se quiser aproveitar e mudar o texto também
//   bodyText: t.Optional(t.String()),
// });

// --- 3. ROTAS ---

export const whatsappTemplatesRoute = new Elysia({
  prefix: '/templates',
})
  .macro(authMacro)

  // GET /templates
  .get(
    '/',
    async ({ organizationId }) => {
      const templates = await prisma.template.findMany({
        where: { instance: { organizationId } },
        orderBy: { createdAt: 'desc' },
      });

      // Cast necessário pois Prisma Json é incompatível com TypeBox estrito
      return templates as unknown as (typeof TemplateResponseSchema.static)[];
    },
    {
      auth: true,
      response: t.Array(TemplateResponseSchema),
      detail: {
        tags: ['WhatsApp Templates'],
        operationId: 'getWhatsappTemplates',
      },
    }
  )

  // POST /templates
  .post(
    '/',
    async ({ body, organizationId, set }) => {
      const {
        name,
        category,
        headerFormat,
        headerText,
        exampleHeader,
        bodyText,
        footerText,
        buttons,
        bodyExamples,
        buttonExamples,
      } = body;

      // 1. Validação de Instância
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { organizationId },
      });

      if (!instance) {
        set.status = 404;
        return { error: 'Instância não encontrada' };
      }

      // 2. Montagem dos Componentes
      const components: MetaComponent[] = [];

      // Header (se especificado e não for NONE)
      if (headerFormat && headerFormat !== 'NONE') {
        const headerComponent: MetaComponent = {
          type: 'HEADER',
          format: headerFormat,
        };

        if (headerFormat === 'TEXT') {
          // Header de texto
          if (headerText) {
            headerComponent.text = headerText;
            // Se tiver variáveis no texto, adiciona os exemplos
            if (headerText.includes('{{') && exampleHeader?.length) {
              headerComponent.example = { header_text: exampleHeader };
            }
          }
        } else if (exampleHeader?.length) {
          // Header de mídia (IMAGE, VIDEO, DOCUMENT)
          // Para mídias, a Meta exige um exemplo (header_handle)
          // Se não for fornecido, enviamos apenas o formato e deixamos a Meta pedir depois
          headerComponent.example = { header_handle: exampleHeader };
        }

        components.push(headerComponent);
      }

      // Body
      const bodyComponent: MetaComponent = { type: 'BODY', text: bodyText };
      if (bodyExamples?.length) {
        bodyComponent.example = { body_text: [bodyExamples] };
      }
      components.push(bodyComponent);

      // Footer
      if (footerText) {
        components.push({ type: 'FOOTER', text: footerText });
      }

      // Buttons
      if (buttons?.length) {
        const buttonsConfig: MetaButtonObj[] = (
          buttons as { text: string; url: string }[]
        ).map((btn, index) => {
          const btnObj: MetaButtonObj = {
            type: 'URL',
            text: btn.text,
            url: btn.url,
          };
          if (btn.url?.includes('{{1}}') && buttonExamples?.[index]) {
            btnObj.example = [buttonExamples[index]];
          }
          return btnObj;
        });
        components.push({ type: 'BUTTONS', buttons: buttonsConfig });
      }

      // 3. Chamada à API da Meta
      const url = `https://graph.facebook.com/v21.0/${instance.wabaId}/message_templates`;

      // Fetch pode lançar erro de rede (DNS, etc), mas não vamos usar try/catch para controle de fluxo lógico
      const metaResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${instance.accessToken}`,
        },
        body: JSON.stringify({
          name,
          category,
          allow_category_change: true,
          language: 'pt_BR',
          components,
        }),
      });

      const metaData = (await metaResponse.json()) as MetaAPIResponse;

      // 4. Tratamento de Erro da Meta (Sem Try/Catch)
      if (metaData.error) {
        set.status = 400;
        return { error: metaData.error.message };
      }

      // 5. Salvar no Banco
      // Se der erro de banco aqui (ex: nome duplicado na unique constraint),
      // o Elysia vai capturar globalmente como 500, o que é o comportamento correto.
      const newTemplate = await prisma.template.create({
        data: {
          wamid: metaData.id,
          name,
          category,
          language: 'pt_BR',
          body: bodyText,
          structure: components as unknown as InputJsonObject, // Cast para Prisma Json
          status: metaData.status || 'PENDING',
          instanceId: instance.id,
        },
      });

      // Conversão do campo structure para o tipo esperado pelo schema
      const responseTemplate = {
        ...newTemplate,
        structure: Array.isArray(newTemplate.structure)
          ? newTemplate.structure
          : JSON.parse(String(newTemplate.structure)),
      };

      return responseTemplate;
    },
    {
      auth: true,
      body: CreateTemplateBodySchema,
      // Importante: A resposta agora pode ser Sucesso (Template) OU Erro (400/404)
      response: {
        200: TemplateResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ['WhatsApp Templates'],
        operationId: 'createWhatsappTemplates',
      },
    }
  ) // POST /templates/import (Sincronizar com a Meta)
  .post(
    '/import',
    async ({ organizationId, set }) => {
      // 1. Validar Instância
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { organizationId },
      });

      if (!instance) {
        set.status = 404;
        return { status: 404, error: 'Instância não encontrada' };
      }

      // 2. Buscar Templates na Meta
      // Limitamos a 100 por página (geralmente suficiente, se tiver mais, precisaria de paginação)
      const url = `https://graph.facebook.com/v21.0/${instance.wabaId}/message_templates?fields=id,name,status,category,language,components&limit=100`;

      const metaResponse = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${instance.accessToken}`,
        },
      });

      const metaData = (await metaResponse.json()) as MetaTemplateListResponse;

      if (metaData.error) {
        set.status = 400;
        return { status: 400, error: metaData.error.message };
      }

      const templates = metaData.data || [];

      // 3. Processar e Salvar no Banco (Upsert)
      // Usamos Promise.all para processar em paralelo e ser rápido
      await Promise.all(
        templates.map(async (tpl) => {
          // Extrair o texto do corpo para salvar na coluna 'body' (facilita busca)
          const bodyComponent = tpl.components.find((c) => c.type === 'BODY');
          const bodyText = bodyComponent?.text || '';

          // O Prisma UPSERT garante que não duplicamos
          return await prisma.template.upsert({
            where: {
              // Chave única composta definida no Schema
              instanceId_name_language: {
                instanceId: instance.id,
                name: tpl.name,
                language: tpl.language,
              },
            },
            update: {
              wamid: tpl.id,
              status: tpl.status,
              category: tpl.category,
              body: bodyText,
              structure: tpl.components as unknown as InputJsonObject, // Atualiza JSON completo
            },
            create: {
              instanceId: instance.id,
              wamid: tpl.id,
              name: tpl.name,
              language: tpl.language,
              status: tpl.status,
              category: tpl.category,
              body: bodyText,
              structure: tpl.components as unknown as InputJsonObject,
            },
          });
        })
      );

      return {
        status: 200,
        data: {
          total: templates.length,
          imported: templates.length,
          message: 'Sincronização concluída com sucesso',
        },
      };
    },
    {
      auth: true,
      // Schema simples, só precisa do ID da instância
      response: {
        200: ImportResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ['WhatsApp Templates'],
        operationId: 'importWhatsappTemplates',
        description:
          'Baixa todos os templates da Meta e salva/atualiza no banco local.',
      },
    }
  )
// .patch(
//   '/:id',
//   async ({ params, body, organizationId, set }) => {
//     const { id } = params;
//     const { category, bodyText } = body;

//     // 1. Busca o template no banco
//     const template = await prisma.template.findUnique({
//       where: { id },
//       include: { instance: true },
//     });

//     if (!template) {
//       set.status = 404;
//       return { status: 404, error: 'Template não encontrado.' };
//     }

//     if (!template.wamid) {
//       set.status = 404;
//       return {
//         status: 404,
//         error: 'Template não encontrado ou sem ID da Meta (wamid).',
//       };
//     }

//     if (template.instance.organizationId !=) {
//       set.status = 403;
//       return { status: 403, error: 'Sem permissão.' };
//     }

//     // 2. Prepara o Payload para a Meta
//     // IMPORTANTE: Para editar, precisamos reenviar a estrutura completa dos componentes.
//     // Se o usuário não mandou texto novo, usamos o antigo do banco.
//     // OBS: Se o template tiver botões/exemplos complexos, você precisaria receber isso no body também.
//     // Para simplificar aqui, vou assumir que estamos editando a categoria e mantendo a estrutura salva.

//     const components = template.structure as { type: string; text?: string }[];

//     // Se mudou o texto, atualiza o componente BODY
//     if (bodyText) {
//       const bodyCompIndex = components.findIndex((c) => c.type === 'BODY');
//       if (bodyCompIndex >= 0) {
//         components[bodyCompIndex].text = bodyText;
//         // Nota: Se mudar o texto e tiver variáveis, teria que mandar os exemplos de novo.
//       }
//     }

//     try {
//       // 3. Chamada à API da Meta para EDITAR
//       // Endpoint: https://graph.facebook.com/v21.0/{MESSAGE_TEMPLATE_ID}
//       const url = `https://graph.facebook.com/v21.0/${template.wamid}`;

//       const metaResponse = await fetch(url, {
//         method: 'POST', // Sim, é POST para editar
//         headers: {
//           'Content-Type': 'application/json',
//           Authorization: `Bearer ${template.instance.accessToken}`,
//         },
//         body: JSON.stringify({
//           category, // A nova categoria
//           components, // A estrutura (mesma ou nova)
//         }),
//       });

//       const metaData = (await metaResponse.json()) as MetaAPIResponse;

//       if (metaData.error) {
//         set.status = 400;
//         console.error('Erro da Meta ao atualizar template:', metaData.error, {
//           category, // A nova categoria
//           components, // A estrutura (mesma ou nova)
//         });
//         return { status: 400, error: metaData.error.message };
//       }

//       // 4. Atualiza no Banco Local
//       // O template volta para PENDING ou o status que a Meta devolver (geralmente null no update, assumimos pending)
//       const updatedTemplate = await prisma.template.update({
//         where: { id },
//         data: {
//           category,
//           body: bodyText || template.body, // Atualiza texto se mudou
//           structure: components,
//           status: 'PENDING', // Força status pendente pois foi editado
//         },
//       });

//       return {
//         status: 200,
//         data: updatedTemplate,
//       };
//     } catch (error) {
//       set.status = 500;
//       return {
//         status: 500,
//         error: (error as Error).message || 'Erro ao atualizar template',
//       };
//     }
//   },
//   {
//     auth: true,
//     body: UpdateTemplateBodySchema,
//     params: t.Object({
//       id: t.String(),
//     }),
//     detail: {
//       tags: ['WhatsApp Templates'],
//       operationId: 'updateWhatsappTemplate',
//     },
//   }
// );
