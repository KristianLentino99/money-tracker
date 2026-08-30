<script setup lang="ts">
import {
  getVehicleMaintenanceReminders,
  type MaintenancePlanStatus,
  type VehicleMaintenanceReminder,
} from '@/api/vehicle-maintenance';
import { updateVehicle } from '@/api/vehicles';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import { StatusBadge } from '@/components/lib/ui/status-badge';
import { useNotificationCenter } from '@/components/notification-center';
import { extractApiErrorMessage } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes/constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { CalendarDaysIcon, ChevronDownIcon, GaugeIcon, Loader2Icon, WrenchIcon } from '@lucide/vue';
import { format, parseISO } from 'date-fns';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const MAX_VISIBLE_REMINDERS = 5;

const { t } = useI18n();
const queryClient = useQueryClient();
const { addErrorNotification, addSuccessNotification } = useNotificationCenter();

const remindersQuery = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenance,
  queryFn: getVehicleMaintenanceReminders,
});

const reminders = computed(() => remindersQuery.data.value ?? []);
const hasReminders = computed(() => reminders.value.length > 0);
const isExpanded = ref(false);
const hasMoreReminders = computed(() => reminders.value.length > MAX_VISIBLE_REMINDERS);
const visibleReminders = computed(() =>
  isExpanded.value ? reminders.value : reminders.value.slice(0, MAX_VISIBLE_REMINDERS),
);

const odometerByVehicleId = ref<Record<string, number | null>>({});

const odometerMutation = useMutation({
  mutationFn: ({ vehicleId, currentMileage }: { vehicleId: string; currentMileage: number }) =>
    updateVehicle({ id: vehicleId, payload: { currentMileage } }),
});

const currentMileageFor = ({ reminder }: { reminder: VehicleMaintenanceReminder }) => {
  const vehicleId = String(reminder.vehicleId);
  const editedMileage = odometerByVehicleId.value[vehicleId];
  return editedMileage !== undefined ? editedMileage : reminder.currentMileage;
};

const normalizeOdometer = (value: string | number | null): number | null => {
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
  const normalizedValue = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(normalizedValue) ? normalizedValue : null;
};

const setCurrentMileage = ({
  reminder,
  value,
}: {
  reminder: VehicleMaintenanceReminder;
  value: string | number | null;
}) => {
  odometerByVehicleId.value[String(reminder.vehicleId)] = normalizeOdometer(value);
};

const canUpdateOdometer = ({ reminder }: { reminder: VehicleMaintenanceReminder }) => {
  const currentMileage = currentMileageFor({ reminder });
  return (
    currentMileage !== null &&
    currentMileage !== undefined &&
    Number.isFinite(currentMileage) &&
    currentMileage >= 0 &&
    currentMileage !== reminder.currentMileage
  );
};

const updateOdometer = async ({ reminder }: { reminder: VehicleMaintenanceReminder }) => {
  if (odometerMutation.isPending.value || !canUpdateOdometer({ reminder })) return;

  const currentMileage = currentMileageFor({ reminder });
  if (currentMileage === null || currentMileage === undefined) return;

  try {
    await odometerMutation.mutateAsync({ vehicleId: String(reminder.vehicleId), currentMileage });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenance }),
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleDetail }),
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehiclesList }),
    ]);
    addSuccessNotification(t('pages.dashboard.vehicleMaintenance.notifications.odometerUpdated'));
  } catch (error) {
    addErrorNotification(
      extractApiErrorMessage(error) ?? t('pages.dashboard.vehicleMaintenance.notifications.odometerUpdateError'),
    );
  }
};

const activityLabel = ({ reminder }: { reminder: VehicleMaintenanceReminder }) => {
  if (reminder.activityName) return reminder.activityName;
  if (reminder.activitySystemKey) {
    return t(`pages.dashboard.vehicleMaintenance.activity.${reminder.activitySystemKey}`);
  }
  return t('pages.dashboard.vehicleMaintenance.activity.other');
};

const formatDate = ({ date }: { date: string }) => format(parseISO(date), 'MMM d, yyyy');

const formatDistance = ({ distance, unit }: { distance: number; unit: string }) =>
  `${distance.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unit}`;

const thresholdLabel = ({ reminder }: { reminder: VehicleMaintenanceReminder }) => {
  const thresholds: string[] = [];
  if (reminder.nextDueDate) {
    thresholds.push(
      t('pages.dashboard.vehicleMaintenance.dueDate', { date: formatDate({ date: reminder.nextDueDate }) }),
    );
  }
  if (reminder.nextDueDistance !== null) {
    thresholds.push(
      t('pages.dashboard.vehicleMaintenance.dueDistance', {
        distance: formatDistance({ distance: reminder.nextDueDistance, unit: reminder.distanceUnit }),
      }),
    );
  }
  return thresholds.join(' · ');
};

const statusVariant = ({ status }: { status: MaintenancePlanStatus }) =>
  status === 'overdue' ? ('destructive' as const) : ('warning' as const);

const vehicleRoute = ({ reminder }: { reminder: VehicleMaintenanceReminder }) => ({
  name: ROUTES_NAMES.accountsVehicleDetails,
  params: { id: String(reminder.vehicleId) },
  hash: '#vehicle-maintenance',
});
</script>

<template>
  <Card
    v-if="hasReminders"
    class="@container/vehicle-reminders overflow-hidden p-5 shadow-xs @md/vehicle-reminders:p-6"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 items-start gap-3">
        <div class="bg-primary/10 text-primary-text flex size-9 shrink-0 items-center justify-center rounded-xl">
          <WrenchIcon class="size-5" />
        </div>
        <div class="min-w-0">
          <h2 class="text-base font-semibold tracking-tight">{{ $t('pages.dashboard.vehicleMaintenance.title') }}</h2>
          <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
            {{ $t('pages.dashboard.vehicleMaintenance.description') }}
          </p>
        </div>
      </div>
      <span class="text-muted-foreground text-xs tabular-nums">
        {{ $t('pages.dashboard.vehicleMaintenance.count', { count: reminders.length }) }}
      </span>
    </div>

    <div class="border-border/70 divide-border/70 mt-5 divide-y border-y">
      <article
        v-for="reminder in visibleReminders"
        :key="reminder.planId"
        class="grid gap-4 py-4 first:pt-0 last:pb-0 @md/vehicle-reminders:grid-cols-[minmax(0,1fr)_minmax(16rem,auto)] @md/vehicle-reminders:items-end"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <RouterLink
              :to="vehicleRoute({ reminder })"
              class="text-foreground focus-visible:ring-ring min-w-0 truncate text-sm font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-hidden"
            >
              {{ reminder.vehicleName || $t('pages.dashboard.vehicleMaintenance.unknownVehicle') }}
            </RouterLink>
            <StatusBadge :variant="statusVariant({ status: reminder.status })">
              {{ $t(`pages.dashboard.vehicleMaintenance.status.${reminder.status}`) }}
            </StatusBadge>
          </div>

          <div
            class="text-muted-foreground mt-2 grid gap-1 text-xs @sm/vehicle-reminders:flex @sm/vehicle-reminders:flex-wrap @sm/vehicle-reminders:gap-x-3 @sm/vehicle-reminders:gap-y-1"
          >
            <span class="inline-flex items-center gap-1.5">
              <WrenchIcon class="size-3.5 shrink-0" />
              <span>{{ activityLabel({ reminder }) }}</span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <CalendarDaysIcon v-if="reminder.nextDueDate" class="size-3.5 shrink-0" />
              <GaugeIcon v-else class="size-3.5 shrink-0" />
              <span>{{ thresholdLabel({ reminder }) }}</span>
            </span>
          </div>
        </div>

        <div class="flex min-w-0 flex-wrap items-end gap-2">
          <InputField
            :id="`vehicle-maintenance-odometer-${reminder.planId}`"
            class="min-w-44 flex-1 @md/vehicle-reminders:min-w-52"
            type="number"
            :model-value="currentMileageFor({ reminder })"
            :label="$t('pages.dashboard.vehicleMaintenance.odometerLabel', { unit: reminder.distanceUnit })"
            :placeholder="$t('pages.dashboard.vehicleMaintenance.odometerPlaceholder')"
            only-positive
            :disabled="odometerMutation.isPending.value"
            @update:model-value="(value) => setCurrentMileage({ reminder, value })"
          />
          <Button
            class="shrink-0"
            variant="outline"
            size="sm"
            :disabled="odometerMutation.isPending.value || !canUpdateOdometer({ reminder })"
            @click="updateOdometer({ reminder })"
          >
            <Loader2Icon v-if="odometerMutation.isPending.value" class="size-4 animate-spin" />
            {{ $t('pages.dashboard.vehicleMaintenance.updateOdometer') }}
          </Button>
        </div>
      </article>
    </div>

    <div v-if="hasMoreReminders" class="mt-4 flex justify-center">
      <Button variant="ghost" size="sm" @click="isExpanded = !isExpanded">
        <ChevronDownIcon class="size-4 transition-transform" :class="{ 'rotate-180': isExpanded }" />
        {{
          $t(
            isExpanded ? 'pages.dashboard.vehicleMaintenance.showLess' : 'pages.dashboard.vehicleMaintenance.showMore',
            { count: reminders.length - MAX_VISIBLE_REMINDERS },
          )
        }}
      </Button>
    </div>
  </Card>
</template>
