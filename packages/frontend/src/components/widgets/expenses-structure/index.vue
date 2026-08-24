<template>
  <WidgetWrapper :is-fetching="isWidgetDataFetching" class="max-h-auto" data-testid="widget-expenses-structure">
    <template #title>
      <div class="flex items-center gap-2">
        {{ $t('dashboard.widgets.expensesStructure.title') }}

        <ExcludedCountBadge v-if="hasExcludedStats" :count="excludedCategoryIds.length" test-id="es-excluded-badge" />
      </div>
    </template>

    <template v-if="widgetConfigRef" #action>
      <ExcludeCategoriesMenu
        :excluded-category-ids="excludedCategoryIds"
        test-id-prefix="es"
        @save="persistExcludedCategories"
      >
        <IncludePlannedMenuItem test-id-prefix="es" />
      </ExcludeCategoriesMenu>
    </template>

    <!-- Stats row - two columns with space between -->
    <div class="mb-4 flex items-start justify-between gap-4">
      <!-- Left: Primary value -->
      <div>
        <div class="text-2xl font-bold tracking-tight">
          <template v-if="isWidgetDataFetching && !hasData">
            <div class="bg-muted h-8 w-32 animate-pulse rounded" />
          </template>
          <template v-else>
            {{ formatBaseCurrency(animatedExpense) }}
          </template>
        </div>
        <div class="text-muted-foreground mt-1 text-xs font-medium tracking-tight uppercase">
          {{ periodLabel }}
        </div>
      </div>

      <!-- Right: Comparison -->
      <div class="flex flex-col items-end gap-1">
        <template v-if="isWidgetDataFetching && !hasData">
          <div class="bg-muted h-6 w-16 animate-pulse rounded-full" />
        </template>
        <template v-else>
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            :class="{
              'bg-destructive-text/15 text-destructive-text': expensesDiff > 0,
              'bg-success-text/15 text-success-text': expensesDiff < 0,
              'bg-muted text-muted-foreground': expensesDiff === 0,
            }"
          >
            {{ expensesDiff > 0 ? '+' : '' }}{{ expensesDiff }}%
          </span>
        </template>
        <div class="text-muted-foreground text-xs tracking-tight">
          {{ $t('dashboard.widgets.expensesStructure.vsPreviousPeriod') }}
        </div>
      </div>
    </div>

    <template v-if="isWidgetDataFetching && !hasData">
      <LoadingState />
    </template>
    <template v-else-if="isDataEmpty && drilldownPath.length === 0">
      <EmptyState>
        <ChartPieIcon class="size-32" />
      </EmptyState>
    </template>
    <template v-else>
      <div v-if="drilldownPath.length > 0" class="mb-1 flex min-w-0 items-center gap-1">
        <Button variant="ghost" size="sm" class="shrink-0 px-2" @click="goBack">
          <ArrowLeftIcon class="size-4" />
          {{ $t('common.actions.back') }}
        </Button>
        <ChevronRightIcon class="text-muted-foreground size-4 shrink-0" />
        <div class="flex min-w-0 items-center gap-1 overflow-hidden text-xs">
          <Button variant="ghost" size="sm" class="h-7 shrink-0 px-1.5 font-normal" @click="goToRoot">
            {{ $t('dashboard.widgets.expensesStructure.allExpenses') }}
          </Button>
          <ChevronRightIcon class="text-muted-foreground size-3 shrink-0" />
          <template v-for="(categoryId, index) in drilldownPath" :key="categoryId">
            <Button
              variant="ghost"
              size="sm"
              class="h-7 min-w-0 shrink truncate px-1.5 font-normal"
              :class="cn(index === drilldownPath.length - 1 && 'text-foreground font-medium')"
              :aria-current="index === drilldownPath.length - 1 ? 'page' : undefined"
              @click="goToPath(index)"
            >
              {{ categoriesMap[categoryId]?.name ?? $t('common.labels.unknown') }}
            </Button>
            <ChevronRightIcon v-if="index < drilldownPath.length - 1" class="text-muted-foreground size-3 shrink-0" />
          </template>
        </div>
      </div>

      <template v-if="isBreakdownLoading">
        <ChartSkeleton />
      </template>
      <template v-else-if="isBreakdownError">
        <ErrorState :message="$t('dashboard.widgets.expensesStructure.loadFailed')" @retry="refetchBreakdown()" />
      </template>
      <template v-else-if="isDataEmpty">
        <EmptyState>
          <ChartPieIcon class="size-32" />
        </EmptyState>
      </template>
      <DonutChart v-else :data="chartData" :total-amount="chartTotalAmount" @category-click="onCategoryClick" />
    </template>
  </WidgetWrapper>
</template>

<script lang="ts" setup>
import ExcludeCategoriesMenu from '@/components/common/category-exclusions/exclude-categories-menu.vue';
import ExcludedCountBadge from '@/components/common/category-exclusions/excluded-count-badge.vue';
import { useCategoryExclusionsConfig } from '@/components/common/category-exclusions/use-category-exclusions-config';
import Button from '@/components/lib/ui/button/Button.vue';
import IncludePlannedMenuItem from '@/components/widgets/components/include-planned-menu-item.vue';
import { useIncludePlannedConfig } from '@/components/widgets/use-include-planned-config';
import { useFormatCurrency } from '@/composable';
import { cn } from '@/lib/utils';
import { ROUTES_NAMES } from '@/routes';
import { useCategoriesStore } from '@/stores';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { ArrowLeftIcon, ChartPieIcon, ChevronRightIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import EmptyState from '../components/empty-state.vue';
import ErrorState from '../components/error-state.vue';
import LoadingState from '../components/loading-state.vue';
import WidgetWrapper from '../components/widget-wrapper.vue';

import ChartSkeleton from './chart-skeleton.vue';
import DonutChart from './donut-chart.vue';
import { resolveExpenseStructureClick } from './expense-structure-breakdown';
import { useExpensesStructureData } from './use-expenses-structure-data';

defineOptions({
  name: 'expenses-structure-widget',
});

const props = defineProps<{
  selectedPeriod: { from: Date; to: Date };
}>();

const { formatBaseCurrency } = useFormatCurrency();
const categoriesStore = useCategoriesStore();
const { categoriesMap } = storeToRefs(categoriesStore);
const router = useRouter();

const { widgetConfigRef, excludedCategoryIds, persistExcludedCategories } = useCategoryExclusionsConfig();
const { includePlanned } = useIncludePlannedConfig();
const drilldownPath = ref<string[]>([]);
const drilldownCategoryId = computed(() => drilldownPath.value.at(-1) ?? null);

const {
  hasExcludedStats,
  periodLabel,
  isWidgetDataFetching,
  animatedExpense,
  expensesDiff,
  chartData,
  isBreakdownLoading,
  isBreakdownError,
  refetchBreakdown,
  isDataEmpty,
  hasData,
  totalAmount,
  chartTotalAmount,
} = useExpensesStructureData({
  selectedPeriod: () => props.selectedPeriod,
  excludedCategoryIds,
  includePlanned,
  categoriesMap,
  drilldownCategoryId,
});

const hasChildren = (categoryId: string) =>
  Object.values(categoriesMap.value).some((category) => category.parentId === categoryId);

const navigateToTransactions = ({ categoryId }: { categoryId: string }) => {
  const categoryIds = [categoryId];

  router.push({
    name: ROUTES_NAMES.transactions,
    query: {
      categoryIds: categoryIds.map(String),
      start: props.selectedPeriod.from.toISOString(),
      end: props.selectedPeriod.to.toISOString(),
      transactionType: TRANSACTION_TYPES.expense,
    },
  });
};

const onCategoryClick = ({ categoryId, isOther = false }: { categoryId: string; isOther?: boolean }) => {
  const action = resolveExpenseStructureClick({
    categoryId,
    hasChildren: hasChildren(categoryId),
    isOther,
  });

  if (action.type === 'drilldown') {
    drilldownPath.value.push(action.categoryId);
    return;
  }

  navigateToTransactions({ categoryId: action.categoryId });
};

const goBack = () => {
  drilldownPath.value.pop();
};

const goToRoot = () => {
  drilldownPath.value = [];
};

const goToPath = (index: number) => {
  drilldownPath.value = drilldownPath.value.slice(0, index + 1);
};

watch(
  [
    () => props.selectedPeriod.from.getTime(),
    () => props.selectedPeriod.to.getTime(),
    excludedCategoryIds,
    includePlanned,
  ],
  () => {
    drilldownPath.value = [];
  },
);
</script>
