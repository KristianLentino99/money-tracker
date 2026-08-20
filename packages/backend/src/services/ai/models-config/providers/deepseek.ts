import { AIModelInfo, AI_PROVIDER } from '@bt/shared/types';

import { AI_MODEL_ID } from '../model-ids';

export const DEEPSEEK_MODELS: Record<Extract<AI_MODEL_ID, `deepseek/${string}`>, AIModelInfo> = {
  [AI_MODEL_ID['deepseek/deepseek-v4-flash']]: {
    id: AI_MODEL_ID['deepseek/deepseek-v4-flash'],
    name: 'DeepSeek V4 Flash',
    provider: AI_PROVIDER.deepseek,
    description: 'Fast and cost-effective DeepSeek model for everyday AI tasks',
    contextWindow: 1_000_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'fast-inference'],
    costTier: 'low',
    pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  },
  [AI_MODEL_ID['deepseek/deepseek-v4-pro']]: {
    id: AI_MODEL_ID['deepseek/deepseek-v4-pro'],
    name: 'DeepSeek V4 Pro',
    provider: AI_PROVIDER.deepseek,
    description: 'Advanced DeepSeek reasoning for complex tasks',
    contextWindow: 1_000_000,
    capabilities: ['text-generation', 'structured-output', 'function-calling', 'agents'],
    costTier: 'medium',
    pricing: { inputPerMillion: 0.435, outputPerMillion: 0.87 },
  },
};
