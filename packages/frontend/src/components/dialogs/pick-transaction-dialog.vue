<script setup lang="ts">
import { ensureChunkLoaded } from '@/i18n';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import RecordsFiltersDialog from '@/components/records-filters/filters-dialog.vue';
import RecordsFilters from '@/components/records-filters/index.vue';
import { useTransactionsWithFilters } from '@/components/records-filters/transactions-with-filters';
import TransactionRecord from '@/components/transactions-list/transaction-record.vue';
import { useVirtualizedInfiniteScroll } from '@/composable/virtualized-infinite-scroll';
import { CUSTOM_BREAKPOINTS } from '@/composable/window-breakpoints';
import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import { useElementSize } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { buildPickTransactionStaticFilters, getPickTransactionGridClass } from './pick-transaction-dialog.helpers';

const props = withDefaults(
  defineProps<{
    open: boolean;
    transactionType?: TRANSACTION_TYPES;
    /** Restrict the picker to transactions recorded on this calendar date. */
    transactionDate?: string;
    /** IDs to hide from the list (e.g. already-selected txs in a multi-pick flow). */
    excludeIds?: TransactionModel['id'][];
  }>(),
  {
    transactionType: undefined,
    transactionDate: undefined,
    excludeIds: () => [],
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  select: [tx: TransactionModel];
}>();

const { t } = useI18n();

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

const {
  isResetButtonDisabled,
  isFiltersOutOfSync,
  resetFilters,
  applyFilters,
  appliedFilters,
  isAnyFiltersApplied,
  filters,
  transactionsPages,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isFetched,
} = useTransactionsWithFilters({
  queryEnabled: isOpen,
  staticFilters: computed(() =>
    buildPickTransactionStaticFilters({
      transactionDate: props.transactionDate,
      transactionType: props.transactionType,
    }),
  ),
});

watch(
  () => props.open,
  (open) => {
    if (open) void ensureChunkLoaded('pages/transactions');
  },
  { immediate: true },
);

const handleSelect = ([tx]: [TransactionModel, TransactionModel | undefined]) => {
  emit('select', tx);
  isOpen.value = false;
};

const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null);
const parentRef = computed<HTMLElement | null>(() => scrollAreaRef.value?.viewportRef?.viewportElement ?? null);
const flatTransactions = computed(() => {
  const all = transactionsPages.value?.pages?.flat() ?? [];
  if (props.excludeIds.length === 0) return all;
  const skip = new Set(props.excludeIds);
  return all.filter((tx) => !skip.has(tx.id));
});
const isListEmpty = computed(() => isFetched.value && flatTransactions.value.length === 0);

const applyPickerFilters = () => {
  const dateFilters = buildPickTransactionStaticFilters({ transactionDate: props.transactionDate });
  if (props.transactionDate && 'start' in dateFilters && 'end' in dateFilters) {
    filters.value.start = dateFilters.start;
    filters.value.end = dateFilters.end;
  }
  applyFilters();
};

const { virtualRows, totalSize } = useVirtualizedInfiniteScroll({
  items: flatTransactions,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  parentRef,
  enabled: isOpen,
  getItemKey: (index) => flatTransactions.value[index]!.id,
});

const isFiltersDialogOpen = ref(false);

watch(appliedFilters, () => {
  isFiltersDialogOpen.value = false;
});

const contentWrapperRef = ref<HTMLElement | null>(null);
const { width: contentWrapperWidth } = useElementSize(contentWrapperRef);
const isMobileView = computed(() => contentWrapperWidth.value <= CUSTOM_BREAKPOINTS.uiMobile);
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="max-w-[900px] h-[85vh]" no-internal-scroll>
    <template #title>
      <span>{{ t('dialogs.pickTransaction.title') }}</span>
    </template>

    <div
      ref="contentWrapperRef"
      class="@container/pick-transaction grid min-h-0 flex-1 grid-cols-1 gap-4"
      :class="getPickTransactionGridClass({ isMobile: isMobileView })"
    >
      <ScrollArea class="relative min-h-0 px-1">
        <template v-if="isMobileView">
          <RecordsFiltersDialog v-model:open="isFiltersDialogOpen" :is-any-filters-applied="isAnyFiltersApplied">
            <ScrollArea class="relative max-h-[calc(100vh-var(--header-height)-32px)]">
              <RecordsFilters
                v-model:filters="filters"
                :is-reset-button-disabled="isResetButtonDisabled"
                :is-filters-out-of-sync="isFiltersOutOfSync"
                @reset-filters="resetFilters"
                @apply-filters="applyPickerFilters"
              />
            </ScrollArea>
          </RecordsFiltersDialog>
        </template>
        <template v-else>
          <RecordsFilters
            v-model:filters="filters"
            :is-reset-button-disabled="isResetButtonDisabled"
            :is-filters-out-of-sync="isFiltersOutOfSync"
            @reset-filters="resetFilters"
            @apply-filters="applyPickerFilters"
          />
        </template>
      </ScrollArea>

      <div
        v-if="isListEmpty"
        class="text-muted-foreground flex min-h-[40vh] items-center justify-center text-center text-sm"
      >
        {{ t('dialogs.pickTransaction.empty') }}
      </div>

      <ScrollArea v-else-if="transactionsPages" ref="scrollAreaRef" class="min-h-0 flex-1" viewport-class="h-full">
        <div :style="{ height: `${totalSize}px`, position: 'relative' }">
          <div
            v-for="virtualRow in virtualRows"
            :key="String(virtualRow.key)"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }"
          >
            <TransactionRecord
              v-if="flatTransactions[virtualRow.index]"
              :tx="flatTransactions[virtualRow.index]!"
              @record-click="handleSelect"
            />
            <div v-else class="flex h-13 items-center justify-center">
              {{ t('transactions.list.loadingMore') }}
            </div>
          </div>
        </div>
        <template v-if="!hasNextPage">
          <p class="text-muted-foreground flex justify-center text-sm">{{ t('transactions.list.noMoreData') }}</p>
        </template>
      </ScrollArea>
    </div>
  </ResponsiveDialog>
</template>
