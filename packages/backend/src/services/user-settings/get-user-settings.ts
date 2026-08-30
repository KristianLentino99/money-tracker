import { getDefaultValue } from '@common/helpers/get-default-value-from-zod-schema';
import UserSettings, { DEFAULT_SETTINGS, ZodSettingsSchema } from '@models/user-settings.model';

import { withTransaction } from '../common/with-transaction';
import { type RedactedSettingsSchema, redactKeyMaterial } from './redact-key-material';

export const getUserSettings = withTransaction(
  async ({ userId }: { userId: number }): Promise<RedactedSettingsSchema> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
      attributes: ['settings'],
    });

    const defaults = {
      ...getDefaultValue(ZodSettingsSchema),
      ...DEFAULT_SETTINGS,
    };

    if (!userSettings) {
      return defaults;
    }

    // Merge defaults with stored settings to include any new fields
    return redactKeyMaterial({ settings: { ...defaults, ...userSettings.settings } });
  },
);
