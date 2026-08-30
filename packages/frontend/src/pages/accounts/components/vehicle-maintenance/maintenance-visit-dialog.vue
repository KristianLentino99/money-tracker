<script setup lang="ts">
import {
  createVehicleMaintenanceVisit,
  getVehicleMaintenanceActivities,
  updateVehicleMaintenanceVisit,
  type EligibleVehicleMaintenanceTransaction,
  type VehicleMaintenanceActivity,
  type VehicleMaintenancePlan,
  type VehicleMaintenanceVisit,
  type VehicleMaintenanceVisitActivityPayload,
} from '@/api/vehicle-maintenance';
import type { VehicleModel } from '@/api/vehicles';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import type { FormattedCategory } from '@/common/types';
import AccountSelectField from '@/components/fields/account-select-field.vue';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import PayeeSelectField from '@/components/fields/payee-select-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { Callout } from '@/components/lib/ui/callout';
import { useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore, useCategoriesStore } from '@/stores';
import { extractApiErrorMessage } from '@/js/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { PAYMENT_TYPES, type AccountModel, type RecordId } from '@bt/shared/types';
import { PlusIcon, Trash2Icon } from '@lucide/vue';
import { format, parseISO } from 'date-fns';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';

import MaintenanceTransactionPickerDialog from './maintenance-transaction-picker-dialog.vue';

const props = defineProps<{
  vehicle: VehicleModel;
  plans: VehicleMaintenancePlan[];
  visit?: VehicleMaintenanceVisit | null;
  linkedTransactionIds?: RecordId[];
}>();

const open = defineModel<boolean>('open', { default: false });

const emit = defineEmits<{
  saved: [visit: VehicleMaintenanceVisit];
}>();

interface ActivitySelection {
  activity: VehicleMaintenanceActivity;
  plan: VehicleMaintenancePlan | null;
  included: boolean;
  nextDueDate: Date | null;
  nextDueDistance: number | null;
  archivePlan: boolean;
}

interface VisitForm {
  serviceDate: Date;
  odometer: number | null;
  notes: string;
}

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const categoriesStore = useCategoriesStore();
const { txTargetableSourceAccountsActiveFirst: accounts } = storeToRefs(accountsStore);
const { formattedCategories } = storeToRefs(categoriesStore);

const activitiesQuery = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenanceActivities,
  queryFn: getVehicleMaintenanceActivities,
});

const form = ref<VisitForm>(buildForm());
const selections = ref<ActivitySelection[]>([]);
const freeActivityLabels = ref<string[]>(['']);
const linkedTransactions = ref<EligibleVehicleMaintenanceTransaction[]>([]);
const pickerOpen = ref(false);
const quickExpenseEnabled = ref(false);
const quickExpenseAccount = ref<AccountModel | null>(null);
const quickExpenseCategory = ref<FormattedCategory | null>(null);
const quickExpenseAmount = ref<number | null>(null);
const quickExpenseDate = ref<Date>(new Date());
const quickExpensePaymentType = ref<PAYMENT_TYPES>(PAYMENT_TYPES.creditCard);
const quickExpensePayeeId = ref<RecordId | null>(null);
const quickExpenseNote = ref('');
const formError = ref<string | null>(null);

const MAX_FREE_ACTIVITY_LABEL_LENGTH = 100;

const isEditing = computed(() => props.visit != null);
const distanceUnit = computed(() => props.vehicle.distanceUnit);
const isSubmitting = computed(() => createMutation.isPending.value || updateMutation.isPending.value);

const paymentTypeOptions = computed(() =>
  Object.values(PAYMENT_TYPES).map((value) => ({
    value,
    label: t(`common.paymentTypes.${value}`),
  })),
);

const selectedPaymentType = computed(
  () => paymentTypeOptions.value.find((option) => option.value === quickExpensePaymentType.value) ?? null,
);

const activeActivities = computed(() =>
  (activitiesQuery.data.value ?? []).filter((activity) => activity.archivedAt === null),
);

const linkedTransactionIdList = computed<RecordId[]>(() => [
  ...(props.linkedTransactionIds ?? []),
  ...linkedTransactions.value.map((transaction) => transaction.id),
]);

const selectedActivityCount = computed(() => selections.value.filter((selection) => selection.included).length);
const freeActivityLabelValues = computed(() =>
  freeActivityLabels.value.map((label) => label.trim()).filter((label) => label.length > 0),
);
const completedActivityCount = computed(() => selectedActivityCount.value + freeActivityLabelValues.value.length);

const activityLabel = (activity: VehicleMaintenanceActivity) =>
  activity.name ??
  (activity.systemKey
    ? t(`pages.vehicleDetails.maintenance.activity.${activity.systemKey}`)
    : t('pages.vehicleDetails.maintenance.activity.other'));

function buildForm(): VisitForm {
  return {
    serviceDate: props.visit?.serviceDate ? parseISO(props.visit.serviceDate) : new Date(),
    odometer: props.visit != null ? props.visit.odometer : props.vehicle.currentMileage,
    notes: props.visit?.notes ?? '',
  };
}

function buildSelections(): ActivitySelection[] {
  return activeActivities.value.map((activity) => {
    const plan = props.plans.find((candidate) => candidate.activityId === activity.id) ?? null;
    const visitActivity = props.visit?.activities.find((candidate) => candidate.activityId === activity.id);
    return {
      activity,
      plan,
      included: visitActivity !== undefined,
      nextDueDate: plan?.nextDueDate ? parseISO(plan.nextDueDate) : null,
      nextDueDistance: plan?.nextDueDistance ?? null,
      archivePlan: false,
    };
  });
}

function buildFreeActivityLabels(): string[] {
  const labels =
    props.visit?.activities
      .filter((activity) => activity.activityId === null)
      .map((activity) => activity.labelSnapshot.trim())
      .filter((label) => label.length > 0) ?? [];
  return labels.length > 0 ? labels : [''];
}

function resetForm() {
  form.value = buildForm();
  selections.value = buildSelections();
  freeActivityLabels.value = buildFreeActivityLabels();
  linkedTransactions.value = [];
  pickerOpen.value = false;
  quickExpenseEnabled.value = false;
  quickExpenseAccount.value = null;
  quickExpenseCategory.value = null;
  quickExpenseAmount.value = null;
  quickExpenseDate.value = form.value.serviceDate;
  quickExpensePaymentType.value = PAYMENT_TYPES.creditCard;
  quickExpensePayeeId.value = null;
  quickExpenseNote.value = '';
  formError.value = null;
}

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    resetForm();
    void Promise.all([accountsStore.refetchAccounts(), categoriesStore.loadCategories({ force: true })]);
  },
  { immediate: true },
);

watch(
  () => activitiesQuery.data.value,
  (activities) => {
    if (open.value && activities && selections.value.length === 0) selections.value = buildSelections();
  },
  { immediate: true },
);

const createMutation = useMutation({
  mutationFn: (payload: Parameters<typeof createVehicleMaintenanceVisit>[0]['payload']) =>
    createVehicleMaintenanceVisit({ vehicleId: props.vehicle.id, payload }),
});

const updateMutation = useMutation({
  mutationFn: (payload: Parameters<typeof updateVehicleMaintenanceVisit>[0]['payload']) =>
    updateVehicleMaintenanceVisit({ vehicleId: props.vehicle.id, visitId: props.visit!.id, payload }),
});

const invalidateAfterMutation = async () => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenance }),
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleDetail }),
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehiclesList }),
    queryClient.invalidateQueries({
      predicate: (query) => (query.queryKey as string[]).includes(VUE_QUERY_GLOBAL_PREFIXES.transactionChange),
    }),
  ]);
};

const toNumberOrNull = (value: string | number | null) => {
  if (value === null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const setQuickExpensePayeeId = (payeeId: string | null) => {
  quickExpensePayeeId.value = payeeId as RecordId | null;
};

const updateFreeActivityLabel = ({ index, value }: { index: number; value: string | number | null }) => {
  freeActivityLabels.value[index] = value === null ? '' : String(value);
};

const addFreeActivityLabel = () => {
  freeActivityLabels.value.push('');
};

const removeFreeActivityLabel = ({ index }: { index: number }) => {
  if (freeActivityLabels.value.length === 1) {
    freeActivityLabels.value[0] = '';
    return;
  }
  freeActivityLabels.value.splice(index, 1);
};

const validate = () => {
  if (!form.value.serviceDate || Number.isNaN(form.value.serviceDate.getTime())) {
    formError.value = t('pages.vehicleDetails.maintenance.visits.validation.serviceDateRequired');
    return false;
  }
  if (!isEditing.value && completedActivityCount.value === 0) {
    formError.value = t('pages.vehicleDetails.maintenance.visits.validation.activityRequired');
    return false;
  }
  if (
    !isEditing.value &&
    freeActivityLabels.value.some((label) => label.trim().length > MAX_FREE_ACTIVITY_LABEL_LENGTH)
  ) {
    formError.value = t('pages.vehicleDetails.maintenance.visits.validation.freeActivityLabelTooLong');
    return false;
  }
  if (form.value.odometer !== null && (!Number.isFinite(form.value.odometer) || form.value.odometer < 0)) {
    formError.value = t('pages.vehicleDetails.maintenance.visits.validation.odometerNonNegative');
    return false;
  }
  for (const selection of selections.value.filter(
    (candidate) => !isEditing.value && candidate.included && candidate.plan,
  )) {
    if (!selection.archivePlan && selection.nextDueDate === null && selection.nextDueDistance === null) {
      formError.value = t('pages.vehicleDetails.maintenance.visits.validation.planTargetRequired');
      return false;
    }
  }
  if (!isEditing.value && quickExpenseEnabled.value) {
    if (!quickExpenseAccount.value || !quickExpenseCategory.value || quickExpenseAmount.value === null) {
      formError.value = t('pages.vehicleDetails.maintenance.visits.validation.quickExpenseRequired');
      return false;
    }
    if (!Number.isFinite(quickExpenseAmount.value) || quickExpenseAmount.value <= 0) {
      formError.value = t('pages.vehicleDetails.maintenance.visits.validation.quickExpensePositive');
      return false;
    }
  }
  return true;
};

const buildActivitiesPayload = (): VehicleMaintenanceVisitActivityPayload[] => [
  ...selections.value
    .filter((selection) => selection.included)
    .map((selection) => {
      const payload: VehicleMaintenanceVisitActivityPayload = {
        activityId: selection.activity.id,
      };
      if (!selection.plan) return payload;
      payload.planId = selection.plan.id;
      payload.nextDueDate = selection.nextDueDate ? format(selection.nextDueDate, 'yyyy-MM-dd') : null;
      payload.nextDueDistance = selection.nextDueDistance;
      if (selection.archivePlan) payload.archivePlan = true;
      return payload;
    }),
  ...freeActivityLabelValues.value.map((label) => ({ label })),
];

const handleSubmit = async () => {
  if (isSubmitting.value || !validate()) return;
  formError.value = null;

  try {
    if (isEditing.value) {
      const result = await updateMutation.mutateAsync({
        serviceDate: format(form.value.serviceDate, 'yyyy-MM-dd'),
        odometer: form.value.odometer,
        notes: form.value.notes || null,
      });
      await invalidateAfterMutation();
      addSuccessNotification(t('pages.vehicleDetails.maintenance.notifications.visitUpdated'));
      emit('saved', result);
      open.value = false;
      return;
    }

    const quickExpense = quickExpenseEnabled.value
      ? {
          accountId: quickExpenseAccount.value!.id,
          amount: quickExpenseAmount.value!,
          date: format(quickExpenseDate.value, 'yyyy-MM-dd'),
          categoryId: quickExpenseCategory.value!.id,
          paymentType: quickExpensePaymentType.value,
          payeeId: quickExpensePayeeId.value,
          note: quickExpenseNote.value || null,
        }
      : undefined;
    const result = await createMutation.mutateAsync({
      serviceDate: format(form.value.serviceDate, 'yyyy-MM-dd'),
      ...(form.value.odometer === null ? {} : { odometer: form.value.odometer }),
      ...(form.value.notes ? { notes: form.value.notes } : {}),
      activities: buildActivitiesPayload(),
      ...(linkedTransactions.value.length > 0
        ? { transactionIds: linkedTransactions.value.map((transaction) => transaction.id) }
        : {}),
      ...(quickExpense ? { quickExpense } : {}),
    });
    await invalidateAfterMutation();
    addSuccessNotification(t('pages.vehicleDetails.maintenance.notifications.visitCreated'));
    emit('saved', result);
    open.value = false;
  } catch (error) {
    formError.value =
      extractApiErrorMessage(error) ?? t('pages.vehicleDetails.maintenance.notifications.visitSaveError');
  }
};

const handleTransactionSelected = (transaction: EligibleVehicleMaintenanceTransaction) => {
  if (!linkedTransactions.value.some((selected) => selected.id === transaction.id)) {
    linkedTransactions.value.push(transaction);
  }
  pickerOpen.value = false;
};
</script>

<template>
  <ResponsiveDialog v-model:open="open" dialog-content-class="max-w-2xl">
    <template #title>
      {{
        $t(
          isEditing
            ? 'pages.vehicleDetails.maintenance.visits.editTitle'
            : 'pages.vehicleDetails.maintenance.visits.createTitle',
        )
      }}
    </template>
    <template #description>{{ $t('pages.vehicleDetails.maintenance.visits.description') }}</template>

    <form id="maintenance-visit-form" class="grid min-h-0 gap-5" @submit.prevent="handleSubmit">
      <div class="@container/visit-fields grid gap-3 @sm/visit-fields:grid-cols-2">
        <DateField
          v-model="form.serviceDate"
          :label="$t('pages.vehicleDetails.maintenance.visits.serviceDateLabel')"
          :placeholder="$t('pages.vehicleDetails.maintenance.visits.serviceDatePlaceholder')"
        />
        <InputField
          :model-value="form.odometer"
          type="number"
          only-positive
          :label="$t('pages.vehicleDetails.maintenance.visits.odometerLabel', { unit: distanceUnit })"
          :placeholder="$t('pages.vehicleDetails.maintenance.visits.odometerPlaceholder')"
          @update:model-value="(value) => (form.odometer = toNumberOrNull(value))"
        />
      </div>

      <TextareaField
        v-model="form.notes"
        :label="$t('pages.vehicleDetails.maintenance.visits.notesLabel')"
        :placeholder="$t('pages.vehicleDetails.maintenance.visits.notesPlaceholder')"
        rows="3"
      />

      <section class="grid gap-3">
        <div>
          <h3 class="text-sm font-semibold">{{ $t('pages.vehicleDetails.maintenance.visits.activitiesTitle') }}</h3>
          <p v-if="!isEditing" class="text-muted-foreground mt-1 text-xs">
            {{ $t('pages.vehicleDetails.maintenance.visits.activitiesDescription') }}
          </p>
        </div>

        <div v-if="isEditing" class="grid gap-2">
          <div
            v-for="activity in visit?.activities ?? []"
            :key="activity.id"
            class="bg-muted/30 text-muted-foreground rounded-lg px-3 py-2 text-sm"
          >
            {{ activity.labelSnapshot }}
          </div>
        </div>
        <div v-else-if="activitiesQuery.isLoading.value" class="grid gap-2">
          <div v-for="index in 3" :key="index" class="bg-muted/30 h-12 animate-pulse rounded-lg" />
        </div>
        <div v-else class="grid gap-2">
          <div
            v-for="selection in selections"
            :key="selection.activity.id"
            role="group"
            :aria-label="activityLabel(selection.activity)"
            class="border-border rounded-lg border p-3"
          >
            <label class="flex cursor-pointer items-start gap-2">
              <Checkbox v-model="selection.included" class="mt-0.5" />
              <span class="grid gap-0.5">
                <span class="text-sm font-medium">{{ activityLabel(selection.activity) }}</span>
                <span v-if="selection.plan" class="text-muted-foreground text-xs">
                  {{ $t('pages.vehicleDetails.maintenance.visits.plannedActivity') }}
                </span>
              </span>
            </label>

            <div
              v-if="selection.included && selection.plan"
              class="@container/activity-targets mt-3 grid gap-3 @sm/activity-targets:grid-cols-2"
            >
              <DateField
                :model-value="selection.nextDueDate ?? undefined"
                :label="$t('pages.vehicleDetails.maintenance.nextDueDateLabel')"
                :placeholder="$t('pages.vehicleDetails.maintenance.visits.nextDueDatePlaceholder')"
                allow-empty
                @update:model-value="(value) => (selection.nextDueDate = value)"
              />
              <InputField
                :model-value="selection.nextDueDistance"
                type="number"
                only-positive
                :label="$t('pages.vehicleDetails.maintenance.visits.nextDueDistanceLabel', { unit: distanceUnit })"
                :placeholder="$t('pages.vehicleDetails.maintenance.nextDueDistancePlaceholder')"
                @update:model-value="(value) => (selection.nextDueDistance = toNumberOrNull(value))"
              />
              <label class="text-muted-foreground flex items-center gap-2 text-xs @sm/activity-targets:col-span-2">
                <Checkbox v-model="selection.archivePlan" />
                <span>{{ $t('pages.vehicleDetails.maintenance.visits.archivePlan') }}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section v-if="!isEditing" class="border-border grid gap-3 rounded-lg border p-3">
        <div>
          <h3 class="text-sm font-semibold">{{ $t('pages.vehicleDetails.maintenance.visits.freeActivitiesTitle') }}</h3>
          <p class="text-muted-foreground mt-1 text-xs">
            {{ $t('pages.vehicleDetails.maintenance.visits.freeActivitiesDescription') }}
          </p>
        </div>

        <div class="grid gap-3">
          <div
            v-for="(label, index) in freeActivityLabels"
            :key="`free-activity-${index}`"
            class="flex items-end gap-2"
          >
            <InputField
              class="min-w-0 flex-1"
              :model-value="label"
              :label="$t('pages.vehicleDetails.maintenance.visits.freeActivityLabel')"
              :placeholder="$t('pages.vehicleDetails.maintenance.visits.freeActivityPlaceholder')"
              :maxlength="MAX_FREE_ACTIVITY_LABEL_LENGTH"
              @update:model-value="(value) => updateFreeActivityLabel({ index, value })"
            />
            <DesktopOnlyTooltip :content="$t('pages.vehicleDetails.maintenance.visits.removeFreeActivity')">
              <Button
                type="button"
                variant="ghost-destructive"
                size="icon-sm"
                :aria-label="$t('pages.vehicleDetails.maintenance.visits.removeFreeActivity')"
                @click="removeFreeActivityLabel({ index })"
              >
                <Trash2Icon class="size-4" />
              </Button>
            </DesktopOnlyTooltip>
          </div>
        </div>

        <Button type="button" variant="outline" size="sm" class="w-fit" @click="addFreeActivityLabel">
          <PlusIcon class="size-4" />
          {{ $t('pages.vehicleDetails.maintenance.visits.addFreeActivity') }}
        </Button>
      </section>

      <section v-if="!isEditing" class="border-border grid gap-3 rounded-lg border p-3">
        <label class="flex cursor-pointer items-start gap-2">
          <Checkbox v-model="quickExpenseEnabled" class="mt-0.5" />
          <span class="grid gap-0.5">
            <span class="text-sm font-medium">{{
              $t('pages.vehicleDetails.maintenance.visits.quickExpenseLabel')
            }}</span>
            <span class="text-muted-foreground text-xs">{{
              $t('pages.vehicleDetails.maintenance.visits.quickExpenseDescription')
            }}</span>
          </span>
        </label>

        <div v-if="quickExpenseEnabled" class="@container/quick-expense grid gap-3 @sm/quick-expense:grid-cols-2">
          <AccountSelectField
            v-model="quickExpenseAccount"
            :accounts="accounts"
            :label="$t('pages.vehicleDetails.maintenance.visits.accountLabel')"
            :placeholder="$t('pages.vehicleDetails.maintenance.visits.accountPlaceholder')"
          />
          <InputField
            v-model="quickExpenseAmount"
            type="number"
            only-positive
            :label="$t('pages.vehicleDetails.maintenance.visits.amountLabel')"
            :placeholder="$t('pages.vehicleDetails.maintenance.visits.amountPlaceholder')"
          />
          <CategorySelectField
            v-model="quickExpenseCategory"
            :values="formattedCategories"
            :label="$t('pages.vehicleDetails.maintenance.visits.categoryLabel')"
            :placeholder="$t('pages.vehicleDetails.maintenance.visits.categoryPlaceholder')"
          />
          <SelectField
            :model-value="selectedPaymentType"
            :values="paymentTypeOptions"
            value-key="value"
            label-key="label"
            :label="$t('pages.vehicleDetails.maintenance.visits.paymentTypeLabel')"
            :placeholder="$t('pages.vehicleDetails.maintenance.visits.paymentTypePlaceholder')"
            @update:model-value="(value) => (quickExpensePaymentType = value?.value ?? PAYMENT_TYPES.creditCard)"
          />
          <DateField
            v-model="quickExpenseDate"
            :label="$t('pages.vehicleDetails.maintenance.visits.expenseDateLabel')"
            :placeholder="$t('pages.vehicleDetails.maintenance.visits.expenseDatePlaceholder')"
          />
          <PayeeSelectField
            :model-value="quickExpensePayeeId"
            :label="$t('pages.vehicleDetails.maintenance.visits.payeeLabel')"
            :placeholder="$t('pages.vehicleDetails.maintenance.visits.payeePlaceholder')"
            :account-id="quickExpenseAccount?.id ?? null"
            @update:model-value="setQuickExpensePayeeId"
          />
          <TextareaField
            v-model="quickExpenseNote"
            class="@sm/quick-expense:col-span-2"
            :label="$t('pages.vehicleDetails.maintenance.visits.expenseNoteLabel')"
            :placeholder="$t('pages.vehicleDetails.maintenance.visits.expenseNotePlaceholder')"
            rows="2"
          />
        </div>
      </section>

      <section v-if="!isEditing" class="border-border grid gap-3 rounded-lg border p-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold">{{ $t('pages.vehicleDetails.maintenance.visits.expensesTitle') }}</h3>
            <p class="text-muted-foreground mt-1 text-xs">
              {{ $t('pages.vehicleDetails.maintenance.visits.expensesDescription') }}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" @click="pickerOpen = true">
            {{ $t('pages.vehicleDetails.maintenance.visits.linkExpense') }}
          </Button>
        </div>
        <div
          v-for="transaction in linkedTransactions"
          :key="transaction.id"
          class="border-border bg-muted/20 rounded-md border px-3 py-2"
        >
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="min-w-0 truncate">{{ transaction.note || $t('common.ui.other') }}</span>
            <span class="text-app-expense-color shrink-0 font-semibold tabular-nums">{{
              transaction.amount.toFixed(2)
            }}</span>
          </div>
        </div>
      </section>

      <Callout v-if="formError" variant="destructive">
        <span>{{ formError }}</span>
      </Callout>
    </form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" :disabled="isSubmitting" @click="open = false">
          {{ $t('common.actions.cancel') }}
        </Button>
        <Button type="submit" form="maintenance-visit-form" :disabled="isSubmitting">
          {{
            $t(
              isEditing
                ? 'pages.vehicleDetails.maintenance.visits.save'
                : 'pages.vehicleDetails.maintenance.visits.create',
            )
          }}
        </Button>
      </div>
    </template>
  </ResponsiveDialog>

  <MaintenanceTransactionPickerDialog
    v-if="!isEditing"
    v-model:open="pickerOpen"
    :exclude-ids="linkedTransactionIdList"
    @select="handleTransactionSelected"
  />
</template>
