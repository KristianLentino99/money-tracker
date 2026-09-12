import { getDefaultValue } from '@common/helpers/get-default-value-from-zod-schema';
import { describe, expect, it } from '@jest/globals';
import { DEFAULT_SETTINGS, SettingsSchema, ZodSettingsSchema } from '@models/user-settings.model';
import * as helpers from '@tests/helpers';

describe('Update user settings', () => {
  it('returns default value when no settings were ever set', async () => {
    const useSettings = await helpers.getUserSettings({ raw: true });
    const defaultUserSettingsValue = {
      ...getDefaultValue(ZodSettingsSchema),
      ...DEFAULT_SETTINGS,
    };

    expect(useSettings).toStrictEqual(defaultUserSettingsValue);
  });

  it('updates empty settings and returns new value right away', async () => {
    const newSettings: SettingsSchema = {
      locale: 'en',
    };

    const updatedUserSettings = await helpers.updateUserSettings({
      raw: true,
      settings: newSettings,
    });
    const expectedSettings = ZodSettingsSchema.parse(newSettings);

    expect(updatedUserSettings).toStrictEqual(expectedSettings);
    expect(await helpers.getUserSettings({ raw: true })).toStrictEqual({
      ...DEFAULT_SETTINGS,
      ...expectedSettings,
    });

    const overridingSettings: SettingsSchema = { locale: 'uk' };

    const overridden = await helpers.updateUserSettings({
      raw: true,
      settings: overridingSettings,
    });
    const expectedOverriddenSettings = ZodSettingsSchema.parse(overridingSettings);

    expect(overridden).toStrictEqual(expectedOverriddenSettings);
    expect(await helpers.getUserSettings({ raw: true })).toStrictEqual({
      ...DEFAULT_SETTINGS,
      ...expectedOverriddenSettings,
    });
  });

  it('saves every accepted widget config shape', async () => {
    const newSettings: SettingsSchema = {
      locale: 'en',
      dashboard: {
        widgets: [
          { widgetId: 'subscriptions-overview', colSpan: 1, rowSpan: 1, config: { type: 'subscription' } },
          { widgetId: 'balance-trend', colSpan: 2, rowSpan: 1 },
          { widgetId: 'balance-trend', colSpan: 2, rowSpan: 1, config: { spikesEnabled: false } },
          {
            widgetId: 'balance-trend',
            colSpan: 2,
            rowSpan: 1,
            config: { spikesEnabled: true, spikePercentThreshold: 10, someOtherKey: 'value' },
          },
          {
            widgetId: 'some-other-widget',
            colSpan: 1,
            rowSpan: 1,
            config: { customKey: 'any-value', anotherKey: 42 },
          },
        ],
      },
    };

    const updatedSettings = await helpers.updateUserSettings({
      raw: true,
      settings: newSettings,
    });

    expect(updatedSettings).toStrictEqual(ZodSettingsSchema.parse(newSettings));
    expect(updatedSettings.dashboard?.widgets[1]?.config).toBeUndefined();

    const fetchedSettings = await helpers.getUserSettings({ raw: true });
    expect(fetchedSettings.dashboard).toStrictEqual(newSettings.dashboard);
    expect(fetchedSettings.dashboard?.widgets[1]?.config).toBeUndefined();
  });

  describe('spike detection config in dashboard widgets', () => {
    it('saves widget with valid spike detection config', async () => {
      const newSettings: SettingsSchema = {
        locale: 'en',
        dashboard: {
          widgets: [
            {
              widgetId: 'balance-trend',
              colSpan: 2,
              rowSpan: 1,
              config: {
                spikesEnabled: true,
                spikePercentThreshold: 5,
                spikeAbsoluteThreshold: 1000,
                spikeMaxCount: 15,
              },
            },
          ],
        },
      };

      const updatedSettings = await helpers.updateUserSettings({
        raw: true,
        settings: newSettings,
      });

      expect(updatedSettings).toStrictEqual(ZodSettingsSchema.parse(newSettings));

      // Verify persistence
      const fetched = await helpers.getUserSettings({ raw: true });
      expect(fetched.dashboard?.widgets[0]?.config).toStrictEqual({
        spikesEnabled: true,
        spikePercentThreshold: 5,
        spikeAbsoluteThreshold: 1000,
        spikeMaxCount: 15,
      });
    });

    it('saves widget with boundary spike config values', async () => {
      const newSettings: SettingsSchema = {
        locale: 'en',
        dashboard: {
          widgets: [
            {
              widgetId: 'balance-trend',
              colSpan: 2,
              rowSpan: 1,
              config: {
                spikePercentThreshold: 1,
                spikeAbsoluteThreshold: 1,
                spikeMaxCount: 1,
              },
            },
          ],
        },
      };

      const updatedSettings = await helpers.updateUserSettings({
        raw: true,
        settings: newSettings,
      });

      expect(updatedSettings).toStrictEqual(ZodSettingsSchema.parse(newSettings));

      // Also test upper boundaries
      const upperSettings: SettingsSchema = {
        locale: 'en',
        dashboard: {
          widgets: [
            {
              widgetId: 'balance-trend',
              colSpan: 2,
              rowSpan: 1,
              config: {
                spikePercentThreshold: 50,
                spikeAbsoluteThreshold: 10000,
                spikeMaxCount: 20,
              },
            },
          ],
        },
      };

      const upperResult = await helpers.updateUserSettings({
        raw: true,
        settings: upperSettings,
      });

      expect(upperResult).toStrictEqual(ZodSettingsSchema.parse(upperSettings));
    });

    it('rejects out-of-range spike config values', async () => {
      const invalidConfigs: Record<string, unknown>[] = [
        { spikePercentThreshold: 0 },
        { spikePercentThreshold: 51 },
        { spikeAbsoluteThreshold: 10001 },
        { spikeMaxCount: 5.5 },
        { spikeMaxCount: 21 },
      ];

      for (const config of invalidConfigs) {
        const res = await helpers.updateUserSettings({
          settings: {
            locale: 'en',
            dashboard: {
              widgets: [{ widgetId: 'balance-trend', colSpan: 2, rowSpan: 1, config }],
            },
          },
        });

        expect({ config, statusCode: res.statusCode }).toStrictEqual({ config, statusCode: 422 });
      }

      const fetched = await helpers.getUserSettings({ raw: true });
      expect(fetched.dashboard).toBeUndefined();
    });
  });
});
