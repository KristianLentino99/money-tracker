<template>
  <SettingRow
    :label="$t('settings.general.distanceUnit.label')"
    :description="$t('settings.general.distanceUnit.description')"
  >
    <SelectField
      class="w-64 shrink-0"
      :model-value="selectedDistanceUnit"
      :values="distanceUnitOptions"
      value-key="value"
      label-key="label"
      :placeholder="$t('settings.general.distanceUnit.placeholder')"
      :disabled="isUpdating || isPatching"
      @update:model-value="handleDistanceUnitChange"
    />
  </SettingRow>
</template>

<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { invalidateDistanceUnitQueries } from '../distance-unit-queries';
import SettingRow from './setting-row.vue';

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { data: userSettings, patchAsync, isUpdating, isPatching } = useUserSettings();

const distanceUnit = computed(() => userSettings.value?.distanceUnit ?? 'km');
const distanceUnitOptions = computed(() => [
  { value: 'km' as const, label: t('settings.general.distanceUnit.kilometers') },
  { value: 'mi' as const, label: t('settings.general.distanceUnit.miles') },
]);
const selectedDistanceUnit = computed(
  () =>
    distanceUnitOptions.value.find((option) => option.value === distanceUnit.value) ?? distanceUnitOptions.value[0]!,
);

const handleDistanceUnitChange = async (value: { value: 'km' | 'mi' } | null) => {
  if (!value || value.value === distanceUnit.value) return;
  try {
    await patchAsync({ distanceUnit: value.value });
    await invalidateDistanceUnitQueries({ queryClient });
    addSuccessNotification(t('settings.general.distanceUnit.successNotification'));
  } catch {
    addErrorNotification(t('settings.general.distanceUnit.errorNotification'));
  }
};
</script>
