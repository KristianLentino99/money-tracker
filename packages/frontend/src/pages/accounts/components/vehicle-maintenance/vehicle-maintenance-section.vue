<script setup lang="ts">
import {
  deleteVehicleMaintenanceVisit,
  getVehicleMaintenanceActivities,
  getVehicleMaintenance,
  updateVehicleMaintenancePlan,
  type VehicleMaintenancePlan,
  type MaintenancePlanStatus,
  type VehicleMaintenanceVisit,
} from '@/api/vehicle-maintenance';
import type { VehicleModel } from '@/api/vehicles';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { Card } from '@/components/lib/ui/card';
import { Callout } from '@/components/lib/ui/callout';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { StatusBadge } from '@/components/lib/ui/status-badge';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable';
import { extractApiErrorMessage } from '@/js/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArchiveIcon, CalendarDaysIcon, GaugeIcon, PencilIcon, PlusIcon, Trash2Icon, WrenchIcon } from '@lucide/vue';
import type { RecordId } from '@bt/shared/types';
import { format, parseISO } from 'date-fns';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import MaintenanceActivityManagerDialog from './maintenance-activity-manager-dialog.vue';
import MaintenancePlanDialog from './maintenance-plan-dialog.vue';
import MaintenanceVisitDialog from './maintenance-visit-dialog.vue';

const props = defineProps<{ vehicle: VehicleModel }>();

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { formatBaseCurrency } = useFormatCurrency();

const maintenanceQuery = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.vehicleMaintenance, props.vehicle.id],
  queryFn: () => getVehicleMaintenance({ vehicleId: props.vehicle.id }),
});

const activitiesQuery = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenanceActivities,
  queryFn: getVehicleMaintenanceActivities,
});

const plans = computed(() => maintenanceQuery.data.value?.plans ?? []);
const visits = computed(() => maintenanceQuery.data.value?.visits ?? []);
const planDialogOpen = ref(false);
const activityManagerOpen = ref(false);
const visitDialogOpen = ref(false);
const editingPlan = ref<VehicleMaintenancePlan | null>(null);
const editingVisit = ref<VehicleMaintenanceVisit | null>(null);
const archiveTarget = ref<VehicleMaintenancePlan | null>(null);
const deleteVisitTarget = ref<VehicleMaintenanceVisit | null>(null);
const deleteGeneratedExpense = ref(false);

const planMutation = useMutation({
  mutationFn: (planId: RecordId) =>
    updateVehicleMaintenancePlan({
      vehicleId: props.vehicle.id,
      planId,
      payload: { archived: true },
    }),
});

const deleteVisitMutation = useMutation({
  mutationFn: ({
    visitId,
    deleteGeneratedExpense: shouldDeleteGeneratedExpense,
  }: {
    visitId: RecordId;
    deleteGeneratedExpense: boolean;
  }) =>
    deleteVehicleMaintenanceVisit({
      vehicleId: props.vehicle.id,
      visitId,
      deleteGeneratedExpense: shouldDeleteGeneratedExpense,
    }),
});

const openCreateDialog = () => {
  editingPlan.value = null;
  planDialogOpen.value = true;
};

const openEditDialog = (plan: VehicleMaintenancePlan) => {
  editingPlan.value = plan;
  planDialogOpen.value = true;
};

const openCreateVisitDialog = () => {
  editingVisit.value = null;
  visitDialogOpen.value = true;
};

const openEditVisitDialog = (visit: VehicleMaintenanceVisit) => {
  editingVisit.value = visit;
  visitDialogOpen.value = true;
};

const invalidateMaintenance = async () => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenance }),
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleDetail }),
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehiclesList }),
  ]);
};

const archivePlan = async () => {
  if (!archiveTarget.value || planMutation.isPending.value) return;
  const target = archiveTarget.value;
  archiveTarget.value = null;

  try {
    await planMutation.mutateAsync(target.id);
    await invalidateMaintenance();
    addSuccessNotification(t('pages.vehicleDetails.maintenance.notifications.archived'));
  } catch (error) {
    addErrorNotification(
      extractApiErrorMessage(error) ?? t('pages.vehicleDetails.maintenance.notifications.archiveError'),
    );
  }
};

const openDeleteVisitDialog = (visit: VehicleMaintenanceVisit) => {
  deleteVisitTarget.value = visit;
  deleteGeneratedExpense.value = false;
};

const deleteVisit = async () => {
  if (!deleteVisitTarget.value || deleteVisitMutation.isPending.value) return;
  const target = deleteVisitTarget.value;
  try {
    await deleteVisitMutation.mutateAsync({
      visitId: target.id,
      deleteGeneratedExpense: deleteGeneratedExpense.value === true,
    });
    deleteVisitTarget.value = null;
    await invalidateMaintenance();
    addSuccessNotification(t('pages.vehicleDetails.maintenance.notifications.visitDeleted'));
  } catch (error) {
    addErrorNotification(
      extractApiErrorMessage(error) ?? t('pages.vehicleDetails.maintenance.notifications.visitDeleteError'),
    );
  }
};

const formatDate = (date: string) => format(parseISO(date), 'MMM d, yyyy');
const formatDistance = (distance: number, unit: string) =>
  `${distance.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unit}`;

const activityLabel = (plan: VehicleMaintenancePlan) => {
  if (plan.activityName) return plan.activityName;
  return plan.activitySystemKey
    ? t(`pages.vehicleDetails.maintenance.activity.${plan.activitySystemKey}`)
    : t('pages.vehicleDetails.maintenance.activity.other');
};

const statusVariant = (status: MaintenancePlanStatus) => {
  if (status === 'overdue') return 'destructive' as const;
  if (status === 'upcoming') return 'warning' as const;
  return 'success' as const;
};

const formatVisitDate = (date: string) => format(parseISO(date), 'MMM d, yyyy');
const formatVisitDistance = (visit: VehicleMaintenanceVisit) =>
  visit.odometer === null
    ? null
    : `${visit.odometer.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${visit.distanceUnit}`;

const formatVisitActivityLabel = (activity: VehicleMaintenanceVisit['activities'][number]) => {
  if (activity.activityId === null) return activity.labelSnapshot;

  const catalogActivity = activitiesQuery.data.value?.find(({ id }) => id === activity.activityId);
  if (catalogActivity?.name) return catalogActivity.name;
  if (catalogActivity?.systemKey) {
    return t(`pages.vehicleDetails.maintenance.activity.${catalogActivity.systemKey}`);
  }

  return activity.labelSnapshot;
};
</script>

<template>
  <Card class="@container/maintenance overflow-hidden p-5 shadow-xs @md/maintenance:p-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex items-start gap-3">
        <div class="bg-primary/10 text-primary-text flex size-9 shrink-0 items-center justify-center rounded-xl">
          <WrenchIcon class="size-5" />
        </div>
        <div>
          <h2 class="text-base font-semibold tracking-tight">{{ $t('pages.vehicleDetails.maintenance.title') }}</h2>
          <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
            {{ $t('pages.vehicleDetails.maintenance.description') }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          :disabled="maintenanceQuery.isLoading.value"
          @click="activityManagerOpen = true"
        >
          {{ $t('pages.vehicleDetails.maintenance.manageActivities') }}
        </Button>
        <Button
          variant="ghost-primary"
          size="sm"
          :disabled="maintenanceQuery.isLoading.value"
          @click="openCreateVisitDialog"
        >
          <PlusIcon class="size-4" />
          {{ $t('pages.vehicleDetails.maintenance.visits.record') }}
        </Button>
        <Button variant="outline" size="sm" @click="openCreateDialog">
          <PlusIcon class="size-4" />
          {{ $t('pages.vehicleDetails.maintenance.addPlan') }}
        </Button>
      </div>
    </div>

    <div v-if="maintenanceQuery.isLoading.value" class="mt-5 grid gap-3 @lg/maintenance:grid-cols-2">
      <div v-for="index in 2" :key="index" class="bg-muted/30 h-36 animate-pulse rounded-xl" />
    </div>
    <Callout v-else-if="maintenanceQuery.isError.value" variant="destructive" class="mt-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span>{{ $t('pages.vehicleDetails.maintenance.loadError') }}</span>
        <Button variant="outline" size="sm" @click="maintenanceQuery.refetch()">
          {{ $t('common.actions.retry') }}
        </Button>
      </div>
    </Callout>
    <div
      v-else-if="plans.length === 0"
      class="border-border bg-muted/20 mt-5 flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center"
    >
      <WrenchIcon class="text-muted-foreground size-7" />
      <h3 class="text-sm font-semibold">{{ $t('pages.vehicleDetails.maintenance.emptyTitle') }}</h3>
      <p class="text-muted-foreground max-w-md text-sm">
        {{ $t('pages.vehicleDetails.maintenance.emptyDescription') }}
      </p>
      <Button size="sm" class="mt-1" @click="openCreateDialog">
        <PlusIcon class="size-4" />
        {{ $t('pages.vehicleDetails.maintenance.addPlan') }}
      </Button>
    </div>
    <div v-else class="mt-5 grid gap-3 @lg/maintenance:grid-cols-2">
      <article v-for="plan in plans" :key="plan.id" class="border-border bg-background/70 rounded-xl border p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="truncate text-sm font-semibold">{{ activityLabel(plan) }}</h3>
            <p class="text-muted-foreground mt-1 text-xs">
              {{
                $t('pages.vehicleDetails.maintenance.leadSummary', {
                  days: plan.leadDays,
                  distance: formatDistance(plan.leadDistance, plan.distanceUnit),
                })
              }}
            </p>
          </div>
          <StatusBadge :variant="statusVariant(plan.status)">
            {{ $t(`pages.vehicleDetails.maintenance.status.${plan.status}`) }}
          </StatusBadge>
        </div>

        <div class="mt-4 grid gap-2 text-sm">
          <div v-if="plan.nextDueDate" class="text-muted-foreground flex items-center gap-2">
            <CalendarDaysIcon class="size-4 shrink-0" />
            <span>{{ $t('pages.vehicleDetails.maintenance.dueDate', { date: formatDate(plan.nextDueDate) }) }}</span>
          </div>
          <div v-if="plan.nextDueDistance !== null" class="text-muted-foreground flex items-center gap-2">
            <GaugeIcon class="size-4 shrink-0" />
            <span>{{
              $t('pages.vehicleDetails.maintenance.dueDistance', {
                distance: formatDistance(plan.nextDueDistance, plan.distanceUnit),
              })
            }}</span>
          </div>
        </div>

        <div class="border-border mt-4 flex justify-end gap-1 border-t pt-3">
          <DesktopOnlyTooltip :content="$t('pages.vehicleDetails.maintenance.editPlan')">
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="$t('pages.vehicleDetails.maintenance.editPlan')"
              :disabled="planMutation.isPending.value"
              @click="openEditDialog(plan)"
            >
              <PencilIcon class="size-4" />
            </Button>
          </DesktopOnlyTooltip>
          <DesktopOnlyTooltip :content="$t('pages.vehicleDetails.maintenance.archivePlan')">
            <Button
              variant="ghost-destructive"
              size="icon-sm"
              :aria-label="$t('pages.vehicleDetails.maintenance.archivePlan')"
              :disabled="planMutation.isPending.value"
              @click="archiveTarget = plan"
            >
              <ArchiveIcon class="size-4" />
            </Button>
          </DesktopOnlyTooltip>
        </div>
      </article>
    </div>

    <section
      v-if="!maintenanceQuery.isLoading.value"
      class="border-border mt-6 rounded-xl border p-4 @md/maintenance:p-5"
      aria-labelledby="vehicle-maintenance-visit-history"
      role="region"
      :aria-label="$t('pages.vehicleDetails.maintenance.visits.historyTitle')"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="vehicle-maintenance-visit-history" class="text-sm font-semibold">
            {{ $t('pages.vehicleDetails.maintenance.visits.historyTitle') }}
          </h3>
          <p class="text-muted-foreground mt-1 text-xs">
            {{ $t('pages.vehicleDetails.maintenance.visits.historyDescription') }}
          </p>
        </div>
        <Button variant="outline" size="sm" @click="openCreateVisitDialog">
          <PlusIcon class="size-4" />
          {{ $t('pages.vehicleDetails.maintenance.visits.add') }}
        </Button>
      </div>

      <div v-if="visits.length === 0" class="text-muted-foreground py-7 text-center text-sm">
        {{ $t('pages.vehicleDetails.maintenance.visits.empty') }}
      </div>
      <div v-else class="mt-4 grid gap-3">
        <article v-for="visit in visits" :key="visit.id" class="border-border bg-background/70 rounded-lg border p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h4 class="text-sm font-semibold">{{ formatVisitDate(visit.serviceDate) }}</h4>
                <span v-if="formatVisitDistance(visit)" class="text-muted-foreground text-xs">
                  {{
                    $t('pages.vehicleDetails.maintenance.visits.odometerSummary', {
                      distance: formatVisitDistance(visit),
                    })
                  }}
                </span>
              </div>
              <p v-if="visit.notes" class="text-muted-foreground mt-2 text-sm">{{ visit.notes }}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-app-expense-color text-sm font-semibold tabular-nums">
                {{ formatBaseCurrency(visit.totalCost) }}
              </span>
              <DesktopOnlyTooltip :content="$t('pages.vehicleDetails.maintenance.visits.edit')">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="$t('pages.vehicleDetails.maintenance.visits.edit')"
                  @click="openEditVisitDialog(visit)"
                >
                  <PencilIcon class="size-4" />
                </Button>
              </DesktopOnlyTooltip>
              <DesktopOnlyTooltip :content="$t('pages.vehicleDetails.maintenance.visits.delete')">
                <Button
                  variant="ghost-destructive"
                  size="icon-sm"
                  :aria-label="$t('pages.vehicleDetails.maintenance.visits.delete')"
                  :disabled="deleteVisitMutation.isPending.value"
                  @click="openDeleteVisitDialog(visit)"
                >
                  <Trash2Icon class="size-4" />
                </Button>
              </DesktopOnlyTooltip>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <span
              v-for="activity in visit.activities"
              :key="activity.id"
              class="bg-muted text-muted-foreground rounded-full px-2 py-1 text-xs"
            >
              {{ formatVisitActivityLabel(activity) }}
            </span>
          </div>
        </article>
      </div>
    </section>

    <MaintenancePlanDialog
      v-if="planDialogOpen"
      v-model:open="planDialogOpen"
      :vehicle="props.vehicle"
      :plan="editingPlan"
    />
    <MaintenanceActivityManagerDialog v-model:open="activityManagerOpen" />
    <MaintenanceVisitDialog
      v-if="visitDialogOpen"
      v-model:open="visitDialogOpen"
      :vehicle="props.vehicle"
      :plans="plans"
      :visit="editingVisit"
      :linked-transaction-ids="visits.flatMap((visit) => visit.transactionIds)"
    />

    <ResponsiveAlertDialog
      :open="archiveTarget !== null"
      confirm-variant="destructive"
      :confirm-label="$t('pages.vehicleDetails.maintenance.archivePlan')"
      :confirm-disabled="planMutation.isPending.value"
      @update:open="(value) => !value && (archiveTarget = null)"
      @confirm="archivePlan"
    >
      <template #title>{{ $t('pages.vehicleDetails.maintenance.archivePlanTitle') }}</template>
      <template #description>{{ $t('pages.vehicleDetails.maintenance.archivePlanDescription') }}</template>
    </ResponsiveAlertDialog>

    <ResponsiveAlertDialog
      :open="deleteVisitTarget !== null"
      confirm-variant="destructive"
      :confirm-label="$t('pages.vehicleDetails.maintenance.visits.delete')"
      :confirm-disabled="deleteVisitMutation.isPending.value"
      @update:open="(value) => !value && (deleteVisitTarget = null)"
      @confirm="deleteVisit"
    >
      <template #title>{{ $t('pages.vehicleDetails.maintenance.visits.deleteTitle') }}</template>
      <template #description>{{ $t('pages.vehicleDetails.maintenance.visits.deleteDescription') }}</template>
      <label v-if="deleteVisitTarget?.generatedTransactionIds.length" class="mt-4 flex items-start gap-2 text-sm">
        <Checkbox v-model="deleteGeneratedExpense" class="mt-0.5" />
        <span>{{ $t('pages.vehicleDetails.maintenance.visits.deleteGeneratedExpense') }}</span>
      </label>
    </ResponsiveAlertDialog>
  </Card>
</template>
