import { AI_CUSTOM_MODEL_NAME_MAX_LENGTH, AI_KEY_PROVIDERS } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { setAiApiKey } from '@services/user-settings/ai-api-key';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    apiKey: z.string().min(1).max(2056),
    provider: z.enum(AI_KEY_PROVIDERS),
    model: z.string().trim().min(1).max(AI_CUSTOM_MODEL_NAME_MAX_LENGTH).optional(),
  }),
});

export const setAiApiKeyController = createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { apiKey, provider, model } = body;

  await setAiApiKey({ userId, apiKey, provider, model });

  return {
    data: {
      success: true,
    },
  };
});
