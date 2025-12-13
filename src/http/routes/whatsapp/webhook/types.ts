// src/http/routes/whatsapp/webhook/types.ts

export interface WhatsAppProfile {
  name: string;
}

export interface WhatsAppContact {
  wa_id: string;
  profile: WhatsAppProfile;
}

export interface WhatsAppMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface WhatsAppError {
  code: number;
  title: string;
  message: string;
  error_data: {
    details: string;
  };
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: WhatsAppError[];
}

export interface WhatsAppMediaContent {
  id: string;
  mime_type: string;
  sha256: string;
  url?: string; // URLs diretas podem vir aqui
  filename?: string; // Documentos têm nome
  caption?: string; // Legenda da mídia
}

export interface WhatsAppTextContent {
  body: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'voice' | 'unknown';

  // Campos opcionais dependendo do 'type'
  text?: WhatsAppTextContent;
  image?: WhatsAppMediaContent;
  video?: WhatsAppMediaContent;
  audio?: WhatsAppMediaContent;
  voice?: WhatsAppMediaContent;
  document?: WhatsAppMediaContent;
  sticker?: WhatsAppMediaContent;
  caption?: string; // Legenda pode vir solta em algumas versões
  errors?: WhatsAppError[];
}

export interface WhatsAppChangeValue {
  messaging_product: 'whatsapp';
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppChange {
  value: WhatsAppChangeValue;
  field: string;
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WhatsAppEntry[];
}