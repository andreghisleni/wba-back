# Documentação de Implementação - WBA Backend

## Visão Geral

Este documento descreve as funcionalidades implementadas e planejadas para o sistema de integração com WhatsApp Business API.

---

## ✅ Funcionalidades Implementadas

### 1. Templates de Mensagem

#### 1.1 Criação de Templates (`POST /whatsapp/templates`)

**Arquivo:** `src/http/routes/whatsapp/templates.ts`

**Campos suportados:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | ✅ | Nome do template (apenas letras minúsculas, números e underscore) |
| `category` | enum | ✅ | `MARKETING`, `UTILITY`, `AUTHENTICATION` |
| `headerFormat` | enum | ❌ | `NONE`, `TEXT`, `IMAGE`, `VIDEO`, `DOCUMENT` |
| `headerText` | string | ❌ | Texto do header (máx. 60 chars) - apenas se `headerFormat === 'TEXT'` |
| `exampleHeader` | string[] | ❌ | Exemplos para variáveis de texto ou handles de mídia |
| `bodyText` | string | ✅ | Texto principal do template |
| `footerText` | string | ❌ | Texto do rodapé |
| `bodyExamples` | string[] | ❌ | Valores de exemplo para variáveis `{{1}}`, `{{2}}`, etc. |
| `buttons` | array | ❌ | Array de botões `{ text, url }` |
| `buttonExamples` | string[] | ❌ | Valores para variáveis em URLs de botões |

**Exemplo de requisição com header de mídia:**
```json
{
  "name": "promo_video",
  "category": "MARKETING",
  "headerFormat": "VIDEO",
  "exampleHeader": ["4::aW1hZ2UvaGVhZGVyLmpwZw=="],
  "bodyText": "Confira nossa nova promoção!",
  "footerText": "Responda SAIR para cancelar"
}
```

**Exemplo de requisição com header de texto:**
```json
{
  "name": "promo_sazonal",
  "category": "MARKETING",
  "headerFormat": "TEXT",
  "headerText": "Promoção de {{1}}!",
  "exampleHeader": ["Verão"],
  "bodyText": "Aproveite {{1}}% de desconto em todos os produtos.",
  "bodyExamples": ["25"]
}
```

#### 1.2 Listagem de Templates (`GET /whatsapp/templates`)

Retorna todos os templates da organização com a estrutura completa (JSON).

#### 1.3 Importação de Templates (`POST /whatsapp/templates/import`)

Sincroniza templates da Meta para o banco de dados local via upsert.

---

### 2. Envio de Mensagens

#### 2.1 Mensagem de Texto (`POST /whatsapp/messages`)

```json
{
  "contactId": "uuid-do-contato",
  "type": "text",
  "message": "Olá, tudo bem?"
}
```

#### 2.2 Mensagem de Template (`POST /whatsapp/messages`)

```json
{
  "contactId": "uuid-do-contato",
  "type": "template",
  "template": {
    "name": "promo_sazonal",
    "language": "pt_BR",
    "bodyValues": ["João", "25"],
    "buttonValues": [
      { "index": 0, "value": "abc123" }
    ]
  }
}
```

---

### 3. Chat / Inbox

- `GET /whatsapp/contacts` - Lista contatos com última mensagem e status da janela 24h
- `GET /whatsapp/contacts/:contactId/messages` - Histórico de mensagens
- `POST /whatsapp/contacts` - Criar novo contato
- `POST /whatsapp/contacts/:contactId/read` - Marcar mensagens como lidas

---

### 4. Webhooks (Recebimento)

**Arquivo:** `src/http/routes/whatsapp/webhook/`

- Recebe mensagens de texto, imagem, vídeo, áudio, documento
- Atualiza status de mensagens (sent, delivered, read)
- Processa cobranças de conversação

---

## 🚧 Funcionalidades a Implementar

### 1. ~~Exibição Formatada de Templates nas Mensagens~~ ✅ IMPLEMENTADO

**Solução implementada:**

#### 1.1 Alteração no Banco de Dados

Adicionado campo `templateParams` (JSON) na tabela `Message`:

```prisma
model Message {
  // ... campos existentes ...
  
  // Parâmetros do template (para renderização formatada)
  templateParams Json?
}
```

**Estrutura do JSON `templateParams`:**
```json
{
  "templateId": "uuid-do-template",
  "templateName": "promo_sazonal",
  "language": "pt_BR",
  "bodyParams": ["João", "25%"],
  "buttonParams": [
    { "index": 0, "value": "abc123" }
  ]
}
```

#### 1.2 Alteração no Envio de Mensagens

**Arquivo:** `src/http/routes/whatsapp/chat.ts`

- Busca o template no banco antes de enviar
- Salva os parâmetros no campo `templateParams`
- Mantém o `body` como texto legível para buscas

#### 1.3 Alteração na Listagem de Mensagens

**Arquivo:** `src/http/routes/whatsapp/chat.ts`

Retorna os dados do template junto com a mensagem:

```typescript
{
  id: "...",
  body: "Template: promo_sazonal",
  type: "template",
  templateParams: {
    templateId: "...",
    templateName: "promo_sazonal",
    language: "pt_BR",
    bodyParams: ["João", "25%"],
    buttonParams: [{ index: 0, value: "abc123" }]
  }
}
```

#### 1.4 Componente de Renderização (Frontend)

**Arquivo:** `src/pages/_app/$organizationSlug/whatsapp/chat/-components/template-message-bubble.tsx`

Componente que renderiza mensagens de template com:
- Header (TEXT, IMAGE, VIDEO, DOCUMENT)
- Body com variáveis substituídas
- Footer
- Botões estilizados

---

### 2. Suporte a Header com Mídia no Envio

**Problema atual:**
O endpoint de envio de templates não suporta envio de parâmetros de header com mídia.

**Solução proposta:**

Adicionar campo `headerValues` no `TemplateParamsSchema`:

```typescript
const TemplateParamsSchema = t.Object({
  name: t.String(),
  language: t.String({ default: 'pt_BR' }),
  // NOVO: Valores para header
  headerValues: t.Optional(t.Array(t.Object({
    type: t.Enum({ text: 'text', image: 'image', video: 'video', document: 'document' }),
    value: t.String(), // Texto ou URL/handle da mídia
  }))),
  bodyValues: t.Optional(t.Array(t.String())),
  buttonValues: t.Optional(t.Array(t.Object({
    index: t.Number(),
    value: t.String(),
  }))),
});
```

---

### 3. Webhook para Receber Templates

**Problema atual:**
Quando um cliente responde a um template com botão, precisamos identificar qual template e qual botão foi clicado.

**Solução proposta:**
- Processar o campo `context` do webhook da Meta
- Linkar a resposta com a mensagem original do template

---

## 📁 Estrutura de Arquivos

```
src/
├── http/
│   └── routes/
│       └── whatsapp/
│           ├── templates.ts      # CRUD de templates
│           ├── chat.ts           # Envio/listagem de mensagens
│           └── webhook/
│               ├── index.ts      # Entrada do webhook
│               ├── handlers.ts   # Processamento
│               └── types.ts      # Tipagens
├── db/
│   └── client.ts                 # Prisma client
└── services/
    ├── contact-service.ts        # Lógica de contatos
    └── webhook-service.ts        # Disparos de webhook

prisma/
└── schema/
    ├── schema.prisma             # Config geral
    └── schema.db.prisma          # Models do WhatsApp
```

---

## 🔗 Referências

- [Meta WhatsApp Business API - Components](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components)
- [Meta WhatsApp Cloud API - Send Messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)

---

*Última atualização: 18 de dezembro de 2025*
