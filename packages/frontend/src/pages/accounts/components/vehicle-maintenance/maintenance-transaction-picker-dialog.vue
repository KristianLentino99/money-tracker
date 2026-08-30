<script setup lang="ts">
import {
  getEligibleVehicleMaintenanceTransactions,
  type EligibleVehicleMaintenanceTransaction,
} from '@/api/vehicle-maintenance';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { useQuery } from '@tanstack/vue-query';
import { format, parseISO } from 'date-fns';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    open: boolean;
    excludeIds?: string[];
  }>(),
  { excludeIds: () => [] },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  select: [transaction: EligibleVehicleMaintenanceTransaction];
}>();

const { t } = useI18n();
const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

const transactionsQuery = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.vehicleMaintenance, 'eligible-transactions'],
  queryFn: getEligibleVehicleMaintenanceTransactions,
  enabled: isOpen,
});

const transactions = computed(() => {
  const excluded = new Set(props.excludeIds);
  return (transactionsQuery.data.value ?? []).filter((transaction) => !excluded.has(String(transaction.id)));
});

const formatDate = (date: string) => format(parseISO(date), 'MMM d, yyyy');
const formatAmount = (amount: number) =>
  amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const selectTransaction = (transaction: EligibleVehicleMaintenanceTransaction) => {
  emit('select', transaction);
  isOpen.value = false;
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="max-w-xl" no-internal-scroll>
    <template #title>{{ $t('pages.vehicleDetails.maintenance.visits.existingExpensesTitle') }}</template>
    <template #description>{{ $t('pages.vehicleDetails.maintenance.visits.existingExpensesDescription') }}</template>

    <ScrollArea class="max-h-[60vh]">
      <div v-if="transactionsQuery.isLoading.value" class="grid gap-2">
        <div v-for="index in 4" :key="index" class="bg-muted/30 h-14 animate-pulse rounded-lg" />
      </div>
      <div v-else-if="transactions.length === 0" class="text-muted-foreground py-8 text-center text-sm">
        {{ $t('pages.vehicleDetails.maintenance.visits.existingExpensesEmpty') }}
      </div>
      <div v-else class="grid gap-2">
        <Button
          v-for="transaction in transactions"
          :key="transaction.id"
          type="button"
          variant="ghost"
          class="border-border h-auto w-full justify-start rounded-lg border px-3 py-3 text-left"
          @click="selectTransaction(transaction)"
        >
          <span class="grid min-w-0 flex-1 gap-0.5">
            <span class="truncate text-sm font-medium">{{ transaction.note || t('common.ui.other') }}</span>
            <span class="text-muted-foreground text-xs">
              {{ transaction.account.name }}<span v-if="transaction.category"> · {{ transaction.category.name }}</span>
              <span v-if="transaction.payee"> · {{ transaction.payee.name }}</span>
            </span>
          </span>
          <span class="grid shrink-0 justify-items-end gap-0.5">
            <span class="text-app-expense-color text-sm font-semibold tabular-nums">{{
              formatAmount(transaction.amount)
            }}</span>
            <span class="text-muted-foreground text-xs">{{ formatDate(transaction.date) }}</span>
          </span>
        </Button>
      </div>
    </ScrollArea>
  </ResponsiveDialog>
</template>
