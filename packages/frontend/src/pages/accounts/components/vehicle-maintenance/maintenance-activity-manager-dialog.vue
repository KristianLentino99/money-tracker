<script setup lang="ts">
import {
  getVehicleMaintenanceActivities,
  updateVehicleMaintenanceActivity,
  type VehicleMaintenanceActivity,
} from '@/api/vehicle-maintenance';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { extractApiErrorMessage } from '@/js/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArchiveIcon, PencilIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const open = defineModel<boolean>('open', { default: false });

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const activitiesQuery = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenanceActivities,
  queryFn: getVehicleMaintenanceActivities,
});

const customActivities = computed(() =>
  (activitiesQuery.data.value ?? []).filter((activity) => activity.systemKey === null),
);

const renameTarget = ref<VehicleMaintenanceActivity | null>(null);
const renameOpen = ref(false);
const renameValue = ref('');
const renameError = ref<string | null>(null);
const archiveTarget = ref<VehicleMaintenanceActivity | null>(null);

watch(open, (isOpen) => {
  if (!isOpen) {
    renameTarget.value = null;
    renameOpen.value = false;
    archiveTarget.value = null;
    renameError.value = null;
  }
});

const updateMutation = useMutation({
  mutationFn: ({ id, payload }: Parameters<typeof updateVehicleMaintenanceActivity>[0]) =>
    updateVehicleMaintenanceActivity({ id, payload }),
});

const openRename = (activity: VehicleMaintenanceActivity) => {
  renameTarget.value = activity;
  renameValue.value = activity.name ?? '';
  renameError.value = null;
  renameOpen.value = true;
};

const saveRename = async () => {
  if (!renameTarget.value || !renameValue.value.trim() || updateMutation.isPending.value) return;
  renameError.value = null;

  try {
    await updateMutation.mutateAsync({
      id: renameTarget.value.id,
      payload: { name: renameValue.value.trim() },
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenanceActivities }),
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenance }),
    ]);
    addSuccessNotification(t('pages.vehicleDetails.maintenance.notifications.activityRenamed'));
    renameTarget.value = null;
    renameOpen.value = false;
  } catch (error) {
    renameError.value =
      extractApiErrorMessage(error) ?? t('pages.vehicleDetails.maintenance.notifications.activityError');
  }
};

const archiveActivity = async () => {
  if (!archiveTarget.value || updateMutation.isPending.value) return;
  const target = archiveTarget.value;
  archiveTarget.value = null;

  try {
    await updateMutation.mutateAsync({ id: target.id, payload: { archived: true } });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenanceActivities }),
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenance }),
    ]);
    addSuccessNotification(t('pages.vehicleDetails.maintenance.notifications.activityArchived'));
  } catch (error) {
    addErrorNotification(
      extractApiErrorMessage(error) ?? t('pages.vehicleDetails.maintenance.notifications.activityError'),
    );
  }
};
</script>

<template>
  <ResponsiveDialog v-model:open="open" dialog-content-class="max-w-lg">
    <template #title>{{ $t('pages.vehicleDetails.maintenance.manageActivitiesTitle') }}</template>
    <template #description>{{ $t('pages.vehicleDetails.maintenance.manageActivitiesDescription') }}</template>

    <div v-if="activitiesQuery.isLoading.value" class="grid gap-3">
      <div v-for="index in 2" :key="index" class="bg-muted/30 h-11 animate-pulse rounded-md" />
    </div>
    <div v-else-if="customActivities.length === 0" class="text-muted-foreground py-6 text-center text-sm">
      {{ $t('pages.vehicleDetails.maintenance.noCustomActivities') }}
    </div>
    <ul v-else class="divide-border grid divide-y rounded-lg border">
      <li v-for="activity in customActivities" :key="activity.id" class="flex items-center gap-3 px-3 py-2.5">
        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ activity.name }}</span>
        <DesktopOnlyTooltip :content="$t('pages.vehicleDetails.maintenance.renameActivity')">
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="$t('pages.vehicleDetails.maintenance.renameActivity')"
            :disabled="updateMutation.isPending.value"
            @click="openRename(activity)"
          >
            <PencilIcon class="size-4" />
          </Button>
        </DesktopOnlyTooltip>
        <DesktopOnlyTooltip :content="$t('pages.vehicleDetails.maintenance.archiveActivity')">
          <Button
            variant="ghost-destructive"
            size="icon-sm"
            :aria-label="$t('pages.vehicleDetails.maintenance.archiveActivity')"
            :disabled="updateMutation.isPending.value"
            @click="archiveTarget = activity"
          >
            <ArchiveIcon class="size-4" />
          </Button>
        </DesktopOnlyTooltip>
      </li>
    </ul>

    <ResponsiveDialog v-if="renameTarget" v-model:open="renameOpen" dialog-content-class="max-w-md">
      <template #title>{{ $t('pages.vehicleDetails.maintenance.renameActivityTitle') }}</template>
      <form class="grid gap-4" @submit.prevent="saveRename">
        <InputField
          v-model="renameValue"
          :label="$t('pages.vehicleDetails.maintenance.customActivityLabel')"
          :placeholder="$t('pages.vehicleDetails.maintenance.customActivityPlaceholder')"
        />
        <p v-if="renameError" class="text-destructive-text text-sm">{{ renameError }}</p>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            :disabled="updateMutation.isPending.value"
            @click="
              renameTarget = null;
              renameOpen = false;
            "
          >
            {{ $t('common.actions.cancel') }}
          </Button>
          <Button type="button" :disabled="updateMutation.isPending.value" @click="saveRename">
            {{ $t('common.actions.save') }}
          </Button>
        </div>
      </template>
    </ResponsiveDialog>

    <ResponsiveAlertDialog
      :open="archiveTarget !== null"
      confirm-variant="destructive"
      :confirm-label="$t('pages.vehicleDetails.maintenance.archiveActivity')"
      :confirm-disabled="updateMutation.isPending.value"
      @update:open="(value) => !value && (archiveTarget = null)"
      @confirm="archiveActivity"
    >
      <template #title>{{ $t('pages.vehicleDetails.maintenance.archiveActivityTitle') }}</template>
      <template #description>{{ $t('pages.vehicleDetails.maintenance.archiveActivityDescription') }}</template>
    </ResponsiveAlertDialog>
  </ResponsiveDialog>
</template>
