import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Elysia, t } from 'elysia';
import { authMacro } from '~/auth';
import { env } from '~/env';
import { r2Client } from '~/lib/r2-client';

// Tipos de arquivo permitidos com seus MIME types
const ALLOWED_TYPES = {
  // Imagens
  'image/jpeg': { ext: 'jpg', category: 'image' },
  'image/png': { ext: 'png', category: 'image' },
  'image/webp': { ext: 'webp', category: 'image' },
  'image/gif': { ext: 'gif', category: 'image' },
  // Vídeos
  'video/mp4': { ext: 'mp4', category: 'video' },
  'video/3gpp': { ext: '3gp', category: 'video' },
  // Áudios
  'audio/aac': { ext: 'aac', category: 'audio' },
  'audio/mp4': { ext: 'm4a', category: 'audio' },
  'audio/mpeg': { ext: 'mp3', category: 'audio' },
  'audio/amr': { ext: 'amr', category: 'audio' },
  'audio/ogg': { ext: 'ogg', category: 'audio' },
  // Documentos
  'application/pdf': { ext: 'pdf', category: 'document' },
  'application/msword': { ext: 'doc', category: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', category: 'document' },
  'application/vnd.ms-excel': { ext: 'xls', category: 'document' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', category: 'document' },
  'application/vnd.ms-powerpoint': { ext: 'ppt', category: 'document' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', category: 'document' },
  'text/plain': { ext: 'txt', category: 'document' },
} as const;

type AllowedMimeType = keyof typeof ALLOWED_TYPES;

// Limites de tamanho por categoria (em bytes)
const SIZE_LIMITS = {
  image: 5 * 1024 * 1024,      // 5MB
  video: 16 * 1024 * 1024,     // 16MB
  audio: 16 * 1024 * 1024,     // 16MB
  document: 100 * 1024 * 1024, // 100MB
} as const;

// Regex para limpeza de nomes de arquivo (definida no top level para performance)
const FILE_EXTENSION_REGEX = /\.[^/.]+$/;
const SPECIAL_CHARS_REGEX = /[^a-zA-Z0-9-_]/g;

function generateUniqueFileName(originalName: string, mimeType: AllowedMimeType): string {
  const typeInfo = ALLOWED_TYPES[mimeType];
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).slice(2, 10);

  // Remove extensão do nome original e caracteres especiais
  const baseName = originalName
    .replace(FILE_EXTENSION_REGEX, '')
    .replace(SPECIAL_CHARS_REGEX, '_')
    .slice(0, 50);

  return `${typeInfo.category}/${timestamp}-${randomStr}-${baseName}.${typeInfo.ext}`;
}

export const uploadRoute = new Elysia()
  .macro(authMacro)
  // Gerar URL pré-assinada para upload
  .post(
    '/upload/presigned-url',
    async ({ body, set }) => {
      const { fileName, mimeType, fileSize } = body;

      // 1. Validar tipo de arquivo
      if (!(mimeType in ALLOWED_TYPES)) {
        set.status = 400;
        return {
          error: 'Tipo de arquivo não suportado',
          allowedTypes: Object.keys(ALLOWED_TYPES),
        };
      }

      const typeInfo = ALLOWED_TYPES[mimeType as AllowedMimeType];

      // 2. Validar tamanho
      const maxSize = SIZE_LIMITS[typeInfo.category];
      if (fileSize > maxSize) {
        set.status = 400;
        return {
          error: `Arquivo muito grande. Máximo permitido: ${Math.round(maxSize / 1024 / 1024)}MB`,
          maxSize,
        };
      }

      // 3. Gerar nome único com path baseado na organização
      const uniqueFileName = `whatsapp/${generateUniqueFileName(fileName, mimeType as AllowedMimeType)}`;

      // 4. Criar comando de upload
      const command = new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: uniqueFileName,
        ContentType: mimeType,
        ContentLength: fileSize,
      });

      // 5. Gerar URL pré-assinada (válida por 10 minutos)
      const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 600 });

      // 6. Retornar URLs
      const publicUrl = `${env.R2_PUBLIC_URL}/${uniqueFileName}`;

      return {
        uploadUrl,      // URL para fazer PUT do arquivo
        publicUrl,      // URL pública final do arquivo após upload
        key: uniqueFileName,
        expiresIn: 600, // segundos
      };
    },
    {
      auth: true,
      body: t.Object({
        fileName: t.String({ minLength: 1, maxLength: 255 }),
        mimeType: t.String(),
        fileSize: t.Number({ minimum: 1 }),
      }),
      response: {
        200: t.Object({
          uploadUrl: t.String(),
          publicUrl: t.String(),
          key: t.String(),
          expiresIn: t.Number(),
        }),
        400: t.Object({
          error: t.String(),
          allowedTypes: t.Optional(t.Array(t.String())),
          maxSize: t.Optional(t.Number()),
        }),
      },
      detail: {
        tags: ['Upload'],
        operationId: 'getPresignedUploadUrl',
        summary: 'Gera URL pré-assinada para upload de arquivo ao R2',
        description: `
Gera uma URL temporária para fazer upload direto de arquivos para o Cloudflare R2.

**Fluxo de uso:**
1. Chame este endpoint com informações do arquivo
2. Use a \`uploadUrl\` retornada para fazer um PUT com o arquivo
3. Após upload bem-sucedido, use a \`publicUrl\` para referenciar o arquivo

**Tipos suportados:**
- Imagens: JPEG, PNG, WebP, GIF (máx 5MB)
- Vídeos: MP4, 3GP (máx 16MB)
- Áudios: AAC, M4A, MP3, AMR, OGG (máx 16MB)
- Documentos: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT (máx 100MB)
        `,
      },
    }
  )
  // Listar tipos de arquivo permitidos
  .get(
    '/upload/allowed-types',
    () => {
      return {
        types: Object.entries(ALLOWED_TYPES).map(([mimeType, info]) => ({
          mimeType,
          extension: info.ext,
          category: info.category,
          maxSize: SIZE_LIMITS[info.category],
          maxSizeMB: Math.round(SIZE_LIMITS[info.category] / 1024 / 1024),
        })),
      };
    },
    {
      auth: true,
      response: {
        200: t.Object({
          types: t.Array(
            t.Object({
              mimeType: t.String(),
              extension: t.String(),
              category: t.String(),
              maxSize: t.Number(),
              maxSizeMB: t.Number(),
            })
          ),
        }),
      },
      detail: {
        tags: ['Upload'],
        operationId: 'getAllowedUploadTypes',
        summary: 'Lista todos os tipos de arquivo permitidos para upload',
      },
    }
  );
