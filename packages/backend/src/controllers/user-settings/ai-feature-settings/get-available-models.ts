import {
  AIModelInfo,
  AIModelInfoWithRecommendation,
  AI_FEATURE,
  AI_KEY_PROVIDERS,
  AI_PROVIDER,
} from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { getAvailableModels, isModelRecommendedForFeature } from '@services/ai';
import { getStoredAiSettings } from '@services/user-settings/ai-api-key';
import { z } from 'zod';

const schema = z.object({
  query: z
    .object({
      provider: z.enum(AI_KEY_PROVIDERS).optional(),
      feature: z.nativeEnum(AI_FEATURE).optional(),
    })
    .optional(),
});

export const getAvailableModelsController = createController(schema, async ({ user, query }) => {
  const { provider, feature } = query ?? {};
  const baseModels: AIModelInfo[] = getAvailableModels({ provider });

  if (!provider || provider === AI_PROVIDER.openrouter) {
    const aiSettings = await getStoredAiSettings({ userId: user.id });
    const openRouterModel = aiSettings?.apiKeys?.find((key) => key.provider === AI_PROVIDER.openrouter)?.model;

    if (openRouterModel) {
      baseModels.push({
        id: `${AI_PROVIDER.openrouter}/${openRouterModel}`,
        name: openRouterModel,
        provider: AI_PROVIDER.openrouter,
        description: 'Model selected from the OpenRouter catalog',
        contextWindow: 0,
        capabilities: ['text-generation'],
        costTier: 'unknown',
      });
    }
  }

  const models: AIModelInfoWithRecommendation[] = baseModels.map((model) => ({
    ...model,
    recommendedForFeature: feature ? isModelRecommendedForFeature({ modelId: model.id, feature }) : undefined,
  }));

  return {
    data: { models },
  };
});
