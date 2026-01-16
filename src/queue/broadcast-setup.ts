// src/queue/broadcast-setup.ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '~/env';

// 1. Cria a conexão com o Redis
const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// 2. Cria a instância da Fila (Queue)
// O nome 'broadcast-campaign' TEM que ser igual ao do worker
export const broadcastQueue = new Queue('broadcast-campaign', {
  connection: connection as never,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s...
    },
    removeOnComplete: {
      age: 24 * 3600, // Mantém jobs completos por 24h
      count: 1000, // Ou até 1000 jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Mantém jobs falhos por 7 dias
    },
  },
});

// Tipos para mapeamento de parâmetros do template na campanha
export interface TemplateParamMapping {
  source: 'fixed' | 'member';
  value?: string; // usado quando source = 'fixed'
  key?: string; // usado quando source = 'member' (referencia additionalParams do membro)
}

export interface ButtonParamMapping {
  index: number;
  source: 'fixed' | 'member';
  value?: string;
  key?: string;
}

export interface CampaignTemplateParams {
  bodyParams?: TemplateParamMapping[];
  buttonParams?: ButtonParamMapping[];
}

// Tipos para os jobs
export interface ButtonValue {
  index: number;
  value: string;
}

export interface BroadcastJobData {
  campaignId: string;
  memberId: string;
  contactId: string;
  contactWaId: string;
  instanceId: string;
  templateId: string;
  templateName: string;
  templateLanguage: string;
  bodyValues?: string[];
  buttonValues?: ButtonValue[];
}

// Função para resolver os valores dos parâmetros com base no mapeamento
export function resolveTemplateParams(
  templateParams: CampaignTemplateParams,
  memberAdditionalParams: Record<string, unknown> | null
): { bodyValues: string[]; buttonValues: ButtonValue[] } {
  const bodyValues: string[] = [];
  const buttonValues: ButtonValue[] = [];

  // Resolve bodyParams
  if (templateParams.bodyParams) {
    for (const param of templateParams.bodyParams) {
      if (param.source === 'fixed') {
        bodyValues.push(param.value ?? '');
      } else if (param.source === 'member' && param.key) {
        const memberValue = memberAdditionalParams?.[param.key];
        bodyValues.push(memberValue !== undefined ? String(memberValue) : '');
      }
    }
  }

  // Resolve buttonParams
  if (templateParams.buttonParams) {
    for (const param of templateParams.buttonParams) {
      let value = '';
      if (param.source === 'fixed') {
        value = param.value ?? '';
      } else if (param.source === 'member' && param.key) {
        const memberValue = memberAdditionalParams?.[param.key];
        value = memberValue !== undefined ? String(memberValue) : '';
      }
      buttonValues.push({ index: param.index, value });
    }
  }

  return { bodyValues, buttonValues };
}

// Função helper para adicionar jobs em batch
export async function enqueueBroadcastMessages(
  campaignId: string,
  jobs: Omit<BroadcastJobData, 'campaignId'>[]
) {
  const bulkJobs = jobs.map((job, index) => ({
    name: `broadcast-${campaignId}-${index}`,
    data: { ...job, campaignId } satisfies BroadcastJobData,
    opts: {
      // Delay escalonado para não sobrecarregar a API (100ms entre cada)
      delay: index * 100,
    },
  }));

  await broadcastQueue.addBulk(bulkJobs);

  return bulkJobs.length;
}
