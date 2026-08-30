<script setup lang="ts">
import {
  createVehicleMaintenanceActivity,
  createVehicleMaintenancePlan,
  getVehicleMaintenanceActivities,
  updateVehicleMaintenancePlan,
  type VehicleMaintenanceActivity,
  type VehicleMaintenancePlan,
} from '@/api/vehicle-maintenance';
import type { VehicleModel } from '@/api/vehicles';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import { useNotificationCenter } from '@/components/notification-center';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { extractApiErrorMessage } from '@/js/errors';
import SelectField from '@/components/fields/select-field.vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { format, parseISO } from 'date-fns';
import type { RecordId } from '@bt/shared/types';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const CREATE_ACTIVITY_ID = '__create-custom-activity__';
const DEFAULT_LEAD_DAYS = 30;
const DEFAULT_LEAD_DISTANCE = 1_000;

interface ActivityOption {
  id: string;
  systemKey: VehicleMaintenanceActivity['systemKey'];
  name: string | null;
  isCreateOption?: boolean;
}

interface MaintenancePlanForm {
  activityId: string;
  customName: string;
  nextDueDate: Date | null;
  nextDueDistance: number | null;
  currentMileage: number | null;
  leadDays: number;
  leadDistance: number;
}

const props = defineProps<{
  vehicle: VehicleModel;
  plan?: VehicleMaintenancePlan | null;
}>();

const open = defineModel<boolean>('open', { default: false });

const emit = defineEmits<{
  saved: [plan: VehicleMaintenancePlan];
}>();

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification } = useNotificationCenter();
const { data: userSettings } = useUserSettings();

const activitiesQuery = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenanceActivities,
  queryFn: getVehicleMaintenanceActivities,
});

const activityLabel = (activity: ActivityOption) => {
  if (activity.isCreateOption) return t('pages.vehicleDetails.maintenance.activity.createCustom');
  if (activity.name) return activity.name;
  return activity.systemKey
    ? t(`pages.vehicleDetails.maintenance.activity.${activity.systemKey}`)
    : t('pages.vehicleDetails.maintenance.activity.other');
};

const activityOptions = computed<ActivityOption[]>(() => [
  ...(activitiesQuery.data.value ?? []).map((activity) => ({
    id: String(activity.id),
    systemKey: activity.systemKey,
    name: activity.name,
  })),
  {
    id: CREATE_ACTIVITY_ID,
    systemKey: null,
    name: null,
    isCreateOption: true,
  },
]);

const isEditing = computed(() => props.plan != null);
const form = ref<MaintenancePlanForm>(buildFormState());
const formError = ref<string | null>(null);

function buildFormState(): MaintenancePlanForm {
  return {
    activityId: props.plan ? String(props.plan.activityId) : '',
    customName: '',
    nextDueDate: props.plan?.nextDueDate ? parseISO(props.plan.nextDueDate) : null,
    nextDueDistance: props.plan?.nextDueDistance ?? null,
    currentMileage: props.vehicle.currentMileage,
    leadDays: props.plan?.leadDays ?? DEFAULT_LEAD_DAYS,
    leadDistance: props.plan?.leadDistance ?? DEFAULT_LEAD_DISTANCE,
  };
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  form.value = buildFormState();
  formError.value = null;
});

watch(
  () => props.plan,
  () => {
    if (open.value) form.value = buildFormState();
  },
);

const selectedActivity = computed(
  () => activityOptions.value.find((activity) => activity.id === form.value.activityId) ?? null,
);

const selectedActivityLabel = computed(() => {
  if (!selectedActivity.value) return '';
  return activityLabel(selectedActivity.value);
});

const hasDistanceTarget = computed(() => form.value.nextDueDistance !== null);
const distanceUnit = computed(() => userSettings.value?.distanceUnit ?? props.vehicle.distanceUnit);
const needsCurrentMileage = computed(
  () => !isEditing.value && hasDistanceTarget.value && props.vehicle.currentMileage === null,
);

const createActivityMutation = useMutation({ mutationFn: createVehicleMaintenanceActivity });

const createPlanMutation = useMutation({
  mutationFn: (payload: Parameters<typeof createVehicleMaintenancePlan>[0]['payload']) =>
    createVehicleMaintenancePlan({ vehicleId: props.vehicle.id, payload }),
});

const updatePlanMutation = useMutation({
  mutationFn: (payload: Parameters<typeof updateVehicleMaintenancePlan>[0]['payload']) =>
    updateVehicleMaintenancePlan({ vehicleId: props.vehicle.id, planId: props.plan!.id, payload }),
});

const isSubmitting = computed(
  () =>
    createActivityMutation.isPending.value || createPlanMutation.isPending.value || updatePlanMutation.isPending.value,
);

const invalidateMaintenanceQueries = async () => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenance }),
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleDetail }),
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehiclesList }),
  ]);
};

const toNumberOrNull = (value: string | number | null) => {
  if (value === null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const validateForm = () => {
  if (!isEditing.value && !form.value.activityId) {
    formError.value = t('pages.vehicleDetails.maintenance.validation.activityRequired');
    return false;
  }
  if (!isEditing.value && form.value.activityId === CREATE_ACTIVITY_ID && !form.value.customName.trim()) {
    formError.value = t('pages.vehicleDetails.maintenance.validation.customActivityRequired');
    return false;
  }
  if (form.value.nextDueDate === null && form.value.nextDueDistance === null) {
    formError.value = t('pages.vehicleDetails.maintenance.validation.targetRequired');
    return false;
  }
  if (
    form.value.nextDueDistance !== null &&
    (!Number.isFinite(form.value.nextDueDistance) || form.value.nextDueDistance < 0)
  ) {
    formError.value = t('pages.vehicleDetails.maintenance.validation.distanceNonNegative');
    return false;
  }
  if (needsCurrentMileage.value && form.value.currentMileage === null) {
    formError.value = t('pages.vehicleDetails.maintenance.validation.currentMileageRequired');
    return false;
  }
  if (
    form.value.currentMileage !== null &&
    (!Number.isFinite(form.value.currentMileage) || form.value.currentMileage < 0)
  ) {
    formError.value = t('pages.vehicleDetails.maintenance.validation.currentMileageNonNegative');
    return false;
  }
  if (!Number.isInteger(form.value.leadDays) || form.value.leadDays < 0) {
    formError.value = t('pages.vehicleDetails.maintenance.validation.leadDaysNonNegative');
    return false;
  }
  if (!Number.isFinite(form.value.leadDistance) || form.value.leadDistance < 0) {
    formError.value = t('pages.vehicleDetails.maintenance.validation.leadDistanceNonNegative');
    return false;
  }
  return true;
};

const handleSubmit = async () => {
  if (isSubmitting.value || !validateForm()) return;
  formError.value = null;

  try {
    let activityId = form.value.activityId;
    if (!isEditing.value && activityId === CREATE_ACTIVITY_ID) {
      const activity = await createActivityMutation.mutateAsync({ name: form.value.customName.trim() });
      await queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenanceActivities });
      activityId = String(activity.id);
      form.value.activityId = activityId;
    }

    const dueDate = form.value.nextDueDate ? format(form.value.nextDueDate, 'yyyy-MM-dd') : null;
    const dueDistance = form.value.nextDueDistance;
    const currentMileage = needsCurrentMileage.value ? form.value.currentMileage : undefined;

    const result = isEditing.value
      ? await updatePlanMutation.mutateAsync({
          nextDueDate: dueDate,
          nextDueDistance: dueDistance,
          leadDays: form.value.leadDays,
          leadDistance: form.value.leadDistance,
        })
      : await createPlanMutation.mutateAsync({
          activityId: activityId as RecordId,
          nextDueDate: dueDate ?? undefined,
          nextDueDistance: dueDistance ?? undefined,
          leadDays: form.value.leadDays,
          leadDistance: form.value.leadDistance,
          ...(currentMileage === null || currentMileage === undefined ? {} : { currentMileage }),
        });

    await invalidateMaintenanceQueries();
    addSuccessNotification(
      t(
        isEditing.value
          ? 'pages.vehicleDetails.maintenance.notifications.updated'
          : 'pages.vehicleDetails.maintenance.notifications.created',
      ),
    );
    emit('saved', result);
    open.value = false;
  } catch (error) {
    formError.value = extractApiErrorMessage(error) ?? t('pages.vehicleDetails.maintenance.notifications.saveError');
  }
};
</script>

<template>
  <ResponsiveDialog v-model:open="open" dialog-content-class="max-w-lg">
    <template #title>
      {{
        $t(
          isEditing
            ? 'pages.vehicleDetails.maintenance.editPlanTitle'
            : 'pages.vehicleDetails.maintenance.createPlanTitle',
        )
      }}
    </template>
    <template #description>{{ $t('pages.vehicleDetails.maintenance.planDescription') }}</template>

    <form class="grid gap-4" @submit.prevent="handleSubmit">
      <template v-if="isEditing">
        <div class="grid gap-1.5">
          <span class="text-foreground text-sm font-medium">{{
            $t('pages.vehicleDetails.maintenance.activityLabel')
          }}</span>
          <div class="border-input bg-muted/30 text-foreground rounded-md border px-3 py-2 text-sm">
            {{
              selectedActivityLabel || props.plan?.activityName || $t('pages.vehicleDetails.maintenance.activity.other')
            }}
          </div>
        </div>
      </template>
      <SelectField
        v-else
        :model-value="selectedActivity"
        :values="activityOptions"
        value-key="id"
        :label="$t('pages.vehicleDetails.maintenance.activityLabel')"
        :placeholder="$t('pages.vehicleDetails.maintenance.activityPlaceholder')"
        :disabled="activitiesQuery.isLoading.value"
        :label-key="activityLabel"
        @update:model-value="(value) => (form.activityId = value?.id ?? '')"
      />

      <InputField
        v-if="form.activityId === CREATE_ACTIVITY_ID"
        v-model="form.customName"
        :label="$t('pages.vehicleDetails.maintenance.customActivityLabel')"
        :placeholder="$t('pages.vehicleDetails.maintenance.customActivityPlaceholder')"
      />

      <div class="@container/targets grid gap-3 @sm/targets:grid-cols-2">
        <div class="grid gap-1.5">
          <DateField
            :model-value="form.nextDueDate ?? undefined"
            :label="$t('pages.vehicleDetails.maintenance.nextDueDateLabel')"
            allow-empty
            @update:model-value="(value: Date | null) => (form.nextDueDate = value)"
          />
          <Button
            v-if="form.nextDueDate"
            type="button"
            variant="ghost"
            size="sm"
            class="justify-self-start"
            @click="form.nextDueDate = null"
          >
            {{ $t('pages.vehicleDetails.maintenance.clearDate') }}
          </Button>
        </div>
        <InputField
          :model-value="form.nextDueDistance"
          type="number"
          only-positive
          :label="$t('pages.vehicleDetails.maintenance.nextDueDistanceLabel', { unit: distanceUnit })"
          :placeholder="$t('pages.vehicleDetails.maintenance.nextDueDistancePlaceholder')"
          @update:model-value="(value) => (form.nextDueDistance = toNumberOrNull(value))"
        />
      </div>

      <InputField
        v-if="needsCurrentMileage"
        :model-value="form.currentMileage"
        type="number"
        only-positive
        :label="$t('pages.vehicleDetails.maintenance.currentMileageLabel', { unit: distanceUnit })"
        :placeholder="$t('pages.vehicleDetails.maintenance.currentMileagePlaceholder')"
        @update:model-value="(value) => (form.currentMileage = toNumberOrNull(value))"
      />

      <div class="@container/leads grid gap-3 @sm/leads:grid-cols-2">
        <InputField
          :model-value="form.leadDays"
          type="number"
          only-positive
          :label="$t('pages.vehicleDetails.maintenance.leadDaysLabel')"
          :placeholder="$t('pages.vehicleDetails.maintenance.leadDaysPlaceholder')"
          @update:model-value="(value) => (form.leadDays = toNumberOrNull(value) ?? DEFAULT_LEAD_DAYS)"
        />
        <InputField
          :model-value="form.leadDistance"
          type="number"
          only-positive
          :label="$t('pages.vehicleDetails.maintenance.leadDistanceLabel', { unit: distanceUnit })"
          :placeholder="$t('pages.vehicleDetails.maintenance.leadDistancePlaceholder')"
          @update:model-value="(value) => (form.leadDistance = toNumberOrNull(value) ?? DEFAULT_LEAD_DISTANCE)"
        />
      </div>

      <p class="text-muted-foreground text-xs leading-relaxed">
        {{ $t('pages.vehicleDetails.maintenance.leadHint') }}
      </p>
      <Callout v-if="formError" variant="destructive">
        <span>{{ formError }}</span>
      </Callout>
    </form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" :disabled="isSubmitting" @click="open = false">
          {{ $t('common.actions.cancel') }}
        </Button>
        <Button type="submit" :disabled="isSubmitting" @click="handleSubmit">
          {{
            $t(
              isEditing ? 'pages.vehicleDetails.maintenance.updatePlan' : 'pages.vehicleDetails.maintenance.createPlan',
            )
          }}
        </Button>
      </div>
    </template>
  </ResponsiveDialog>
</template>
