<script setup lang="ts">
import {
  addPlanCategory,
  autoAssign,
  createPlan,
  deletePlanCategoryTarget,
  deletePlan,
  movePlanMoney,
  loadPlanView,
  loadPlans,
  previewAutoAssign,
  setPlanAssignment,
  setPlanCategoryTarget,
  undoPlanAllocation,
} from '@/api/plans';
import { loadUserBaseCurrency } from '@/api/currencies';
import CategoryFormDialog from '@/components/dialogs/category-form-dialog.vue';
import { InputField, SelectField } from '@/components/fields';
import PageWrapper from '@/components/common/page-wrapper.vue';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import DesktopOnlyTooltip from '@/components/lib/ui/tooltip/desktop-only-tooltip.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const/vue-query';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { useCategoriesStore } from '@/stores';
import { ApiErrorResponseError } from '@/js/errors';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { useNotificationCenter } from '@/components/notification-center';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  FilterIcon,
  ListFilterIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
  TargetIcon,
  Trash2Icon,
  WalletIcon,
  XIcon,
} from '@lucide/vue';
import { addMonths, endOfMonth, format, parseISO, setDate, startOfMonth, subMonths } from 'date-fns';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { FormattedCategory } from '@/common/types';
import { asDecimal, CATEGORY_TYPES, type endpointsTypes, type RecordId } from '@bt/shared/types';

import CategoryInspectorContent from './components/category-inspector-content.vue';

type PlanCategoryRow = endpointsTypes.PlanCategoryRowResponse;
type AggregateCategory = Omit<
  PlanCategoryRow,
  'assigned' | 'activity' | 'available' | 'upcomingObligation' | 'underfundedBy'
> & {
  assigned: number;
  activity: number;
  available: number;
  upcomingObligation: number | null;
  underfundedBy: number | null;
};
type PlanFilter = 'all' | 'attention' | 'funded' | 'unassigned' | 'activity';

type CategoryGroup = {
  parent: PlanCategoryRow;
  children: PlanCategoryRow[];
};

const route = useRoute();
const queryClient = useQueryClient();
const categoriesStore = useCategoriesStore();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { t } = useI18n();
const isMobileView = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const selectedPlanId = ref<string | null>(null);
const periodStart = ref('');
const isCreateDialogOpen = ref(false);
const isAutoAssignDialogOpen = ref(false);
const isMoveDialogOpen = ref(false);
const isDeleteDialogOpen = ref(false);
const isCategoryInspectorOpen = ref(false);
const isCategoryFormOpen = ref(false);
const categoryFormMode = ref<'create' | 'edit'>('create');
const categoryFormParent = ref<FormattedCategory | undefined>();
const categoryFormCategory = ref<FormattedCategory | undefined>();
const selectedCategoryId = ref<RecordId | null>(null);
const search = ref('');
const activeFilter = ref<PlanFilter>('all');
const expandedGroups = ref<Record<string, boolean>>({});
const moveSource = ref<PlanCategoryRow | null>(null);
const moveDestination = ref<PlanCategoryRow | null>(null);
const moveAmount = ref<number | null>(null);
const autoAssignPreviewData = ref<Awaited<ReturnType<typeof previewAutoAssign>> | null>(null);
const templateId = ref<string | undefined>();
const planName = ref('My Plan');
const includeHistoricalTransactions = ref(false);
const editingAssignments = ref<Record<string, string>>({});

const plansQuery = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.plansList,
  queryFn: () => loadPlans(),
});

const baseCurrencyQuery = useQuery({
  queryKey: VUE_QUERY_CACHE_KEYS.baseCurrency,
  queryFn: loadUserBaseCurrency,
  enabled: isCreateDialogOpen,
});

const selectedPlan = computed(() => plansQuery.data.value?.find((plan) => plan.id === selectedPlanId.value) ?? null);

const planViewQuery = useQuery({
  queryKey: computed(() => [...VUE_QUERY_CACHE_KEYS.planViews, selectedPlanId.value, periodStart.value]),
  queryFn: () => loadPlanView({ planId: selectedPlanId.value!, periodStart: periodStart.value }),
  enabled: computed(() => Boolean(selectedPlanId.value && periodStart.value)),
});

const allCategoryRows = computed(() => planViewQuery.data.value?.groups.flatMap((group) => group.categories) ?? []);
const categoryById = computed(() => new Map(allCategoryRows.value.map((category) => [category.id, category])));
const categoryChildrenByParent = computed(() => {
  const children = new Map<string, PlanCategoryRow[]>();
  for (const category of allCategoryRows.value) {
    if (!category.parentId) continue;
    const current = children.get(category.parentId) ?? [];
    current.push(category);
    children.set(category.parentId, current);
  }
  return children;
});

const categoryGroups = computed<CategoryGroup[]>(() => {
  const topLevel = allCategoryRows.value.filter((category) => !category.parentId);
  const topLevelIds = new Set(topLevel.map((category) => category.id));
  const groups = topLevel.map((parent) => ({
    parent,
    children: categoryChildrenByParent.value.get(parent.id) ?? [],
  }));

  for (const category of allCategoryRows.value) {
    if (category.parentId && !topLevelIds.has(category.parentId)) {
      groups.push({ parent: category, children: [] });
    }
  }

  return groups;
});

const selectedCategory = computed(() =>
  selectedCategoryId.value ? (categoryById.value.get(selectedCategoryId.value) ?? null) : null,
);
const selectedParentName = computed(() => {
  const parentId = selectedCategory.value?.parentId;
  return parentId ? (categoryById.value.get(parentId)?.name ?? null) : null;
});
const aggregateCategory = ({ parent, children }: CategoryGroup): AggregateCategory => {
  if (!children.length) return parent;
  const rows = [parent, ...children];
  const assigned = rows.reduce((sum, row) => sum + row.assigned, 0);
  const activity = rows.reduce((sum, row) => sum + row.activity, 0);
  const available = rows.reduce((sum, row) => sum + row.available, 0);
  const upcoming = rows.reduce((sum, row) => sum + (row.upcomingObligation ?? 0), 0);
  const status = rows.some((row) => row.status === 'overspent')
    ? 'overspent'
    : rows.some((row) => row.status === 'underfunded')
      ? 'underfunded'
      : rows.some((row) => row.status === 'funded')
        ? 'funded'
        : 'none';

  return {
    ...parent,
    assigned,
    activity,
    available,
    status,
    upcomingObligation: upcoming || null,
    underfundedBy: Math.max(0, upcoming - available) || null,
  };
};

const normalizedSearch = computed(() => search.value.trim().toLocaleLowerCase());
type FilterableCategory = { status: PlanCategoryRow['status']; assigned: number; activity: number };
const matchesFilter = (category: FilterableCategory) => {
  switch (activeFilter.value) {
    case 'attention':
      return category.status === 'underfunded' || category.status === 'overspent';
    case 'funded':
      return category.status === 'funded';
    case 'unassigned':
      return category.assigned === 0;
    case 'activity':
      return category.activity !== 0;
    default:
      return true;
  }
};
const matchesSearch = (category: PlanCategoryRow) =>
  !normalizedSearch.value || category.name.toLocaleLowerCase().includes(normalizedSearch.value);

const visibleGroups = computed(() => {
  return categoryGroups.value
    .map((group) => {
      const aggregate = aggregateCategory(group);
      const parentMatches = matchesFilter(aggregate) && matchesSearch(group.parent);
      const visibleChildren = group.children.filter((child) => matchesFilter(child) && matchesSearch(child));
      const searchMatchesParent = matchesSearch(group.parent);
      const children =
        searchMatchesParent && !normalizedSearch.value ? group.children.filter(matchesFilter) : visibleChildren;
      return { ...group, aggregate, children, visible: parentMatches || children.length > 0 };
    })
    .filter((group) => group.visible);
});

const filterOptions: Array<{ key: PlanFilter; label: string; icon?: typeof CircleAlertIcon }> = [
  { key: 'all', label: 'plan.filters.all' },
  { key: 'attention', label: 'plan.filters.attention', icon: CircleAlertIcon },
  { key: 'funded', label: 'plan.filters.funded' },
  { key: 'unassigned', label: 'plan.filters.unassigned' },
  { key: 'activity', label: 'plan.filters.activity' },
];

const filterCount = ({ key }: { key: PlanFilter }) => {
  if (key === 'all') return allCategoryRows.value.length;
  return allCategoryRows.value.filter(matchesFilterForKey({ key })).length;
};

const matchesFilterForKey =
  ({ key }: { key: PlanFilter }) =>
  (category: FilterableCategory) => {
    if (key === 'all') return true;
    if (key === 'attention') return category.status === 'underfunded' || category.status === 'overspent';
    if (key === 'funded') return category.status === 'funded';
    if (key === 'unassigned') return category.assigned === 0;
    return category.activity !== 0;
  };

const planCategoryToFormatted = (category: PlanCategoryRow): FormattedCategory => {
  const stored = categoriesStore.categoriesMap[category.id];
  if (stored) return { ...stored, subCategories: [] };
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon,
    key: null,
    parentId: category.parentId,
    type: CATEGORY_TYPES.custom,
    userId: 0,
    subCategories: [],
  };
};

const formatMoney = (amount: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: planViewQuery.data.value?.plan.baseCurrencyCode ?? baseCurrencyQuery.data.value?.currencyCode ?? 'EUR',
  }).format(amount);

const coveragePercent = ({
  category,
}: {
  category: Pick<AggregateCategory, 'assigned' | 'available' | 'upcomingObligation' | 'target'>;
}) => {
  const target = category.target?.amount ?? category.upcomingObligation ?? Math.max(category.assigned, 0);
  if (target <= 0) return category.available > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (category.available / target) * 100));
};

const setPeriodForPlan = ({ planId }: { planId: string }) => {
  const plan = plansQuery.data.value?.find((item) => item.id === planId);
  if (!plan) return;
  const today = new Date();
  const currentMonthStart = startOfMonth(today);
  const candidate = setDate(currentMonthStart, Math.min(plan.periodStartDay, endOfMonth(today).getDate()));
  const start =
    today < candidate
      ? setDate(
          subMonths(currentMonthStart, 1),
          Math.min(plan.periodStartDay, endOfMonth(subMonths(currentMonthStart, 1)).getDate()),
        )
      : candidate;
  periodStart.value = format(start, 'yyyy-MM-dd');
};

watch(
  () => plansQuery.data.value,
  (plans) => {
    if (!plans?.length) {
      selectedPlanId.value = null;
      return;
    }
    const routePlanId = typeof route.query.planId === 'string' ? route.query.planId : null;
    const selected =
      plans.find((plan) => plan.id === routePlanId) ??
      plans.find((plan) => plan.id === selectedPlanId.value) ??
      plans.find((plan) => plan.isDefault) ??
      plans[0];
    if (selected && selected.id !== selectedPlanId.value) {
      selectedPlanId.value = selected.id;
      setPeriodForPlan({ planId: selected.id });
    }
  },
  { immediate: true },
);

watch(isMobileView, (mobile) => {
  if (mobile && selectedCategory.value) isCategoryInspectorOpen.value = true;
});

onMounted(() => {
  void categoriesStore.loadCategories();
});

const movePeriod = ({ direction }: { direction: 'previous' | 'next' }) => {
  if (!selectedPlan.value || !periodStart.value) return;
  const next =
    direction === 'next' ? addMonths(parseISO(periodStart.value), 1) : subMonths(parseISO(periodStart.value), 1);
  const start = setDate(next, Math.min(selectedPlan.value.periodStartDay, endOfMonth(next).getDate()));
  periodStart.value = format(start, 'yyyy-MM-dd');
};

const selectCategory = ({ categoryId }: { categoryId: RecordId }) => {
  selectedCategoryId.value = categoryId;
  if (isMobileView.value) isCategoryInspectorOpen.value = true;
};

const toggleGroup = ({ groupId }: { groupId: string }) => {
  expandedGroups.value[groupId] = !(expandedGroups.value[groupId] ?? true);
};

const isGroupExpanded = ({ groupId }: { groupId: string }) => expandedGroups.value[groupId] ?? true;

const beginAssignment = ({ categoryId, assigned }: { categoryId: string; assigned: number }) => {
  editingAssignments.value[categoryId] = String(assigned);
};

const commitAssignment = ({ categoryId, fallback }: { categoryId: string; fallback: number }) => {
  const raw = editingAssignments.value[categoryId];
  if (raw === undefined) return;
  const assigned = Number(raw);
  delete editingAssignments.value[categoryId];
  if (!Number.isFinite(assigned) || assigned < 0 || assigned === fallback) return;
  assignmentMutation.mutate({ categoryId, assigned });
};

const cancelAssignment = ({ categoryId }: { categoryId: string }) => {
  delete editingAssignments.value[categoryId];
};

const categoryRows = computed(() => allCategoryRows.value);

const createMutation = useMutation({
  mutationFn: () =>
    createPlan({
      name: planName.value.trim(),
      baseCurrencyCode: baseCurrencyQuery.data.value?.currencyCode ?? '',
      includeHistoricalTransactions: includeHistoricalTransactions.value,
      templateId: templateId.value,
    }),
  onSuccess: async (plan) => {
    await queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.plansList });
    selectedPlanId.value = plan.id;
    isCreateDialogOpen.value = false;
    templateId.value = undefined;
  },
});

const deleteMutation = useMutation({
  mutationFn: () => deletePlan({ planId: selectedPlanId.value! }),
  onSuccess: async () => {
    isDeleteDialogOpen.value = false;
    selectedPlanId.value = null;
    periodStart.value = '';
    await queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.plansList });
    addSuccessNotification(t('plan.notifications.deleted'));
  },
  onError: (error) => {
    const message = error instanceof ApiErrorResponseError ? error.data.message : t('plan.notifications.deleteFailed');
    addErrorNotification(message ?? t('plan.notifications.deleteFailed'));
  },
});

const setViewFromMutation = async (view: Awaited<ReturnType<typeof setPlanAssignment>>['view']) => {
  queryClient.setQueryData([...VUE_QUERY_CACHE_KEYS.planViews, selectedPlanId.value, periodStart.value], view);
  await queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.planViews });
};

const assignmentMutation = useMutation({
  mutationFn: ({ categoryId, assigned }: { categoryId: string; assigned: number }) =>
    setPlanAssignment({
      planId: selectedPlanId.value!,
      periodStart: periodStart.value,
      categoryId,
      payload: {
        assigned,
        expectedRevision: planViewQuery.data.value!.period.revision,
        requestId: crypto.randomUUID(),
      },
    }),
  onSuccess: async (result) => {
    await setViewFromMutation(result.view);
  },
});

const targetMutation = useMutation({
  mutationFn: ({ categoryId, amount, dueDate }: { categoryId: string; amount: number; dueDate: string }) =>
    setPlanCategoryTarget({
      planId: selectedPlanId.value!,
      categoryId,
      payload: { amount: asDecimal(amount), dueDate },
    }),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.planViews });
    addSuccessNotification(t('plan.notifications.targetSaved'));
  },
  onError: (error) => {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('plan.notifications.targetSaveFailed');
    addErrorNotification(message ?? t('plan.notifications.targetSaveFailed'));
  },
});

const deleteTargetMutation = useMutation({
  mutationFn: ({ categoryId }: { categoryId: string }) =>
    deletePlanCategoryTarget({ planId: selectedPlanId.value!, categoryId }),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.planViews });
    addSuccessNotification(t('plan.notifications.targetDeleted'));
  },
  onError: (error) => {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('plan.notifications.targetDeleteFailed');
    addErrorNotification(message ?? t('plan.notifications.targetDeleteFailed'));
  },
});

const moveMutation = useMutation({
  mutationFn: () =>
    movePlanMoney({
      planId: selectedPlanId.value!,
      periodStart: periodStart.value,
      payload: {
        sourceCategoryId: moveSource.value!.id,
        destinationCategoryId: moveDestination.value!.id,
        amount: moveAmount.value ?? 0,
        expectedRevision: planViewQuery.data.value!.period.revision,
        requestId: crypto.randomUUID(),
      },
    }),
  onSuccess: async (result) => {
    await setViewFromMutation(result.view);
    isMoveDialogOpen.value = false;
    addSuccessNotification(t('plan.notifications.moved'));
  },
});

const openMoveDialog = () => {
  moveSource.value = categoryRows.value[0] ?? null;
  moveDestination.value = categoryRows.value[1] ?? null;
  moveAmount.value = null;
  isMoveDialogOpen.value = true;
};

const autoAssignPreviewMutation = useMutation({
  mutationFn: () => previewAutoAssign({ planId: selectedPlanId.value!, periodStart: periodStart.value }),
  onSuccess: (preview) => {
    autoAssignPreviewData.value = preview;
    isAutoAssignDialogOpen.value = true;
  },
});

const autoAssignMutation = useMutation({
  mutationFn: () =>
    autoAssign({
      planId: selectedPlanId.value!,
      periodStart: periodStart.value,
      payload: { expectedRevision: planViewQuery.data.value!.period.revision, requestId: crypto.randomUUID() },
    }),
  onSuccess: async (result) => {
    await setViewFromMutation(result.view);
    isAutoAssignDialogOpen.value = false;
    addSuccessNotification(t('plan.notifications.autoAssigned'));
  },
});

const undoMutation = useMutation({
  mutationFn: () =>
    undoPlanAllocation({
      planId: selectedPlanId.value!,
      periodStart: periodStart.value,
      payload: {
        eventId: planViewQuery.data.value!.undo!.eventId,
        expectedRevision: planViewQuery.data.value!.period.revision,
        requestId: crypto.randomUUID(),
      },
    }),
  onSuccess: async (result) => {
    await setViewFromMutation(result.view);
    addSuccessNotification(t('plan.notifications.undone'));
  },
});

const addCategoryMutation = useMutation({
  mutationFn: ({ categoryId }: { categoryId: RecordId }) =>
    addPlanCategory({ planId: selectedPlanId.value!, categoryId }),
  onSuccess: async (_result, variables) => {
    await queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.planViews });
    selectedCategoryId.value = variables.categoryId;
    isCategoryInspectorOpen.value = true;
    addSuccessNotification(t('plan.notifications.categoryAdded'));
  },
  onError: (error) => {
    const message =
      error instanceof ApiErrorResponseError ? error.data.message : t('plan.notifications.categoryAddFailed');
    addErrorNotification(message ?? t('plan.notifications.categoryAddFailed'));
  },
});

const startCreateCategory = ({ parent }: { parent?: PlanCategoryRow }) => {
  categoryFormMode.value = 'create';
  categoryFormCategory.value = undefined;
  categoryFormParent.value = parent ? planCategoryToFormatted(parent) : undefined;
  isCategoryFormOpen.value = true;
};

const startEditCategory = () => {
  if (!selectedCategory.value) return;
  categoryFormMode.value = 'edit';
  categoryFormParent.value = undefined;
  categoryFormCategory.value = planCategoryToFormatted(selectedCategory.value);
  isCategoryFormOpen.value = true;
};

const saveSelectedCategoryTarget = (payload: { amount: number; dueDate: string }) => {
  if (!selectedCategory.value) return;
  targetMutation.mutate({ categoryId: selectedCategory.value.id, ...payload });
};

const deleteSelectedCategoryTarget = () => {
  if (!selectedCategory.value) return;
  deleteTargetMutation.mutate({ categoryId: selectedCategory.value.id });
};

const handleCategorySaved = async (category: FormattedCategory) => {
  if (categoryFormMode.value === 'create') {
    addCategoryMutation.mutate({ categoryId: category.id });
  } else {
    await queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.planViews });
    selectedCategoryId.value = category.id;
    addSuccessNotification(t('plan.notifications.categoryUpdated'));
  }
};

const startCreate = ({ withTemplate }: { withTemplate: boolean }) => {
  templateId.value = withTemplate ? 'starter' : undefined;
  planName.value = withTemplate ? 'Starter Plan' : 'My Plan';
  includeHistoricalTransactions.value = false;
  isCreateDialogOpen.value = true;
};
</script>

<template>
  <PageWrapper class="@container/plan">
    <div class="mx-auto grid max-w-[1400px] gap-4">
      <section v-if="plansQuery.isLoading.value" class="grid gap-3" aria-busy="true">
        <div v-for="index in 4" :key="index" class="bg-muted h-16 animate-pulse rounded-xl" />
      </section>
      <section
        v-else-if="plansQuery.isError.value"
        class="border-border bg-card grid gap-3 rounded-2xl border p-8 text-center"
      >
        <h1 class="font-semibold">{{ $t('plan.error.title') }}</h1>
        <p class="text-muted-foreground text-sm">{{ $t('plan.error.description') }}</p>
        <UiButton class="mx-auto" variant="outline" @click="plansQuery.refetch()">{{
          $t('common.actions.retry')
        }}</UiButton>
      </section>
      <template v-else-if="!plansQuery.data.value?.length">
        <section class="border-border bg-card relative grid gap-5 overflow-hidden rounded-2xl border p-8 text-center">
          <div
            class="bg-primary/10 pointer-events-none absolute -top-20 left-1/2 size-56 -translate-x-1/2 rounded-full blur-3xl"
          />
          <WalletIcon class="text-primary-text relative mx-auto size-10" aria-hidden="true" />
          <div class="relative grid gap-2">
            <h1 class="text-xl font-semibold text-balance">{{ $t('plan.empty.title') }}</h1>
            <p class="text-muted-foreground mx-auto max-w-md text-sm leading-6">{{ $t('plan.empty.description') }}</p>
          </div>
          <div class="relative flex flex-wrap justify-center gap-2">
            <UiButton @click="startCreate({ withTemplate: false })"
              ><PlusIcon class="size-4" />{{ $t('plan.actions.create') }}</UiButton
            >
            <UiButton variant="outline" @click="startCreate({ withTemplate: true })"
              ><SparklesIcon class="size-4" />{{ $t('plan.actions.template') }}</UiButton
            >
          </div>
        </section>
      </template>

      <section v-else-if="selectedPlan && planViewQuery.isLoading.value" class="grid gap-3" aria-busy="true">
        <div v-for="index in 6" :key="index" class="bg-muted h-12 animate-pulse rounded-lg" />
      </section>
      <section
        v-else-if="selectedPlan && planViewQuery.isError.value"
        class="border-border bg-card grid gap-3 rounded-2xl border p-8 text-center"
      >
        <h1 class="font-semibold">{{ $t('plan.error.title') }}</h1>
        <UiButton class="mx-auto" variant="outline" @click="planViewQuery.refetch()">{{
          $t('common.actions.retry')
        }}</UiButton>
      </section>
      <template v-else-if="selectedPlan && planViewQuery.data.value">
        <header class="flex flex-wrap items-center justify-between gap-4 px-1">
          <div class="flex min-w-0 items-center gap-3">
            <div class="bg-primary/10 text-primary-text grid size-11 shrink-0 place-items-center rounded-xl">
              <WalletIcon class="size-5" aria-hidden="true" />
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h1 class="truncate text-xl font-semibold text-balance">{{ selectedPlan.name }}</h1>
                <span class="bg-muted text-muted-foreground rounded-full px-2 py-1 text-xs">{{
                  planViewQuery.data.value.plan.baseCurrencyCode
                }}</span>
              </div>
              <p class="text-muted-foreground text-sm">{{ $t('plan.header.subtitle') }}</p>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <DesktopOnlyTooltip :content="String($t('plan.actions.previousPeriod'))">
              <UiButton
                variant="ghost"
                size="icon-sm"
                :aria-label="String($t('plan.actions.previousPeriod'))"
                @click="movePeriod({ direction: 'previous' })"
              >
                <ChevronLeftIcon class="size-4" aria-hidden="true" />
              </UiButton>
            </DesktopOnlyTooltip>
            <span class="text-muted-foreground min-w-36 text-center text-sm tabular-nums">
              {{ planViewQuery.data.value.period.start }} – {{ planViewQuery.data.value.period.end }}
            </span>
            <DesktopOnlyTooltip :content="String($t('plan.actions.nextPeriod'))">
              <UiButton
                variant="ghost"
                size="icon-sm"
                :aria-label="String($t('plan.actions.nextPeriod'))"
                @click="movePeriod({ direction: 'next' })"
              >
                <ChevronRightIcon class="size-4" aria-hidden="true" />
              </UiButton>
            </DesktopOnlyTooltip>
            <UiButton
              v-if="planViewQuery.data.value.plan.canManage"
              variant="ghost-destructive"
              size="sm"
              @click="isDeleteDialogOpen = true"
            >
              <Trash2Icon class="size-4" aria-hidden="true" />
              {{ $t('plan.actions.delete') }}
            </UiButton>
          </div>
        </header>

        <section
          class="border-border bg-card grid gap-4 rounded-2xl border p-5 @md/plan:grid-cols-[minmax(0,1fr)_auto] @md/plan:items-center"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-muted-foreground text-sm">{{ $t('plan.readyToAssign.label') }}</p>
              <span
                :class="[
                  'rounded-full px-2 py-1 text-xs font-medium',
                  planViewQuery.data.value.readyToAssignState === 'negative'
                    ? 'bg-destructive/10 text-destructive-text'
                    : 'bg-success/10 text-success-text',
                ]"
              >
                {{ $t(`plan.readyToAssign.${planViewQuery.data.value.readyToAssignState}`) }}
              </span>
            </div>
            <p
              class="mt-1 text-3xl font-semibold tracking-tight tabular-nums"
              :class="
                planViewQuery.data.value.readyToAssignState === 'negative'
                  ? 'text-app-expense-color'
                  : 'text-app-income-color'
              "
            >
              {{ formatMoney(planViewQuery.data.value.readyToAssign) }}
            </p>
            <p
              v-if="planViewQuery.data.value.readyToAssignState === 'negative'"
              class="text-app-expense-color mt-1 text-sm"
            >
              {{
                $t('plan.readyToAssign.overAssigned', {
                  amount: formatMoney(planViewQuery.data.value.readyToAssignDeficit ?? 0),
                })
              }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2 @md/plan:justify-end">
            <UiButton
              variant="outline"
              :disabled="autoAssignPreviewMutation.isPending.value"
              @click="autoAssignPreviewMutation.mutate()"
            >
              <SparklesIcon class="size-4" />{{ $t('plan.actions.autoAssign') }}
            </UiButton>
            <UiButton variant="ghost" :disabled="categoryRows.length < 2" @click="openMoveDialog">{{
              $t('plan.actions.moveMoney')
            }}</UiButton>
            <UiButton
              variant="ghost"
              :disabled="!planViewQuery.data.value.undo?.canUndo || undoMutation.isPending.value"
              @click="undoMutation.mutate()"
            >
              <RotateCcwIcon class="size-4" />{{ $t('plan.actions.undo') }}
            </UiButton>
          </div>
        </section>

        <section class="border-border bg-card grid gap-3 rounded-2xl border p-3 @md/plan:p-4">
          <div class="flex flex-col gap-3 @md/plan:flex-row @md/plan:items-center">
            <div class="relative min-w-0 flex-1">
              <SearchIcon
                class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <InputField
                v-model="search"
                :label="$t('plan.filters.searchLabel')"
                :placeholder="$t('plan.filters.searchPlaceholder')"
                non-label-wrapper
                class="[&_input]:pl-9 [&_label]:sr-only"
              />
            </div>
            <UiButton variant="outline" class="shrink-0" @click="startCreateCategory({})">
              <PlusIcon class="size-4" />{{ $t('plan.actions.newCategory') }}
            </UiButton>
          </div>
          <div
            class="flex min-w-0 items-center gap-2 overflow-x-auto pb-1"
            role="toolbar"
            :aria-label="String($t('plan.filters.label'))"
          >
            <FilterIcon class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
            <UiButton
              v-for="option in filterOptions"
              :key="option.key"
              size="sm"
              :variant="activeFilter === option.key ? 'default' : 'secondary'"
              :aria-pressed="activeFilter === option.key"
              class="shrink-0"
              @click="activeFilter = option.key"
            >
              <component :is="option.icon" v-if="option.icon" class="size-3.5" aria-hidden="true" />
              {{ $t(option.label) }}
              <span class="text-xs opacity-70">{{ filterCount({ key: option.key }) }}</span>
            </UiButton>
            <UiButton
              v-if="search || activeFilter !== 'all'"
              variant="ghost"
              size="sm"
              class="shrink-0"
              @click="
                search = '';
                activeFilter = 'all';
              "
            >
              <XIcon class="size-3.5" />{{ $t('plan.filters.clear') }}
            </UiButton>
          </div>
        </section>

        <div class="@container/plan-layout grid gap-4 @lg/plan-layout:grid-cols-[minmax(0,1fr)_20rem]">
          <main class="min-w-0">
            <section
              v-if="!visibleGroups.length"
              class="border-border bg-card grid place-items-center gap-3 rounded-2xl border p-10 text-center"
            >
              <ListFilterIcon class="text-muted-foreground size-8" aria-hidden="true" />
              <div class="grid gap-1">
                <h2 class="font-medium">{{ $t('plan.filters.noResults') }}</h2>
                <p class="text-muted-foreground text-sm">{{ $t('plan.filters.noResultsDescription') }}</p>
              </div>
            </section>

            <div v-else class="border-border bg-card overflow-hidden rounded-2xl border">
              <div
                class="text-muted-foreground hidden grid-cols-[minmax(0,1fr)_8rem_8rem_8rem] gap-4 border-b px-4 py-3 text-xs @sm/plan-layout:grid"
              >
                <span>{{ $t('plan.columns.category') }}</span>
                <span class="text-right">{{ $t('plan.columns.assigned') }}</span>
                <span class="text-right">{{ $t('plan.columns.activity') }}</span>
                <span class="text-right">{{ $t('plan.columns.available') }}</span>
              </div>

              <section
                v-for="group in visibleGroups"
                :key="group.parent.id"
                class="border-border border-b last:border-b-0"
              >
                <div
                  v-if="group.children.length"
                  class="hover:bg-muted/30 focus-visible:ring-ring grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset @sm/plan-layout:grid-cols-[auto_minmax(0,1fr)_8rem_8rem_8rem]"
                  role="button"
                  tabindex="0"
                  :aria-expanded="isGroupExpanded({ groupId: group.parent.id })"
                  @click="selectCategory({ categoryId: group.parent.id })"
                  @keydown.enter="selectCategory({ categoryId: group.parent.id })"
                  @keydown.space.prevent="selectCategory({ categoryId: group.parent.id })"
                >
                  <UiButton
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="String($t('plan.actions.toggleCategory'))"
                    @click.stop="toggleGroup({ groupId: group.parent.id })"
                  >
                    <ChevronDownIcon
                      :class="[
                        'size-4 transition-transform',
                        !isGroupExpanded({ groupId: group.parent.id }) && '-rotate-90',
                      ]"
                      aria-hidden="true"
                    />
                  </UiButton>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <TagIcon class="text-primary-text size-4 shrink-0" aria-hidden="true" />
                      <span class="truncate font-semibold">{{ group.parent.name }}</span>
                      <span class="text-muted-foreground text-xs">{{ group.children.length }}</span>
                    </div>
                    <div class="bg-muted mt-2 h-1 overflow-hidden rounded-full">
                      <div
                        class="bg-success h-full rounded-full transition-[width] duration-200"
                        :style="{ width: `${coveragePercent({ category: group.aggregate })}%` }"
                      />
                    </div>
                  </div>
                  <span class="text-right font-medium tabular-nums">{{ formatMoney(group.aggregate.available) }}</span>
                  <span class="hidden text-right tabular-nums @sm/plan-layout:block">{{
                    formatMoney(group.aggregate.assigned)
                  }}</span>
                  <span
                    class="hidden text-right tabular-nums @sm/plan-layout:block"
                    :class="group.aggregate.activity < 0 ? 'text-app-expense-color' : 'text-app-income-color'"
                    >{{ formatMoney(group.aggregate.activity) }}</span
                  >
                </div>

                <template v-if="isGroupExpanded({ groupId: group.parent.id }) || !group.children.length">
                  <div
                    v-for="category in group.children.length ? group.children : [group.parent]"
                    :key="category.id"
                    class="hover:bg-muted/30 focus-visible:ring-ring grid cursor-pointer gap-2 px-4 py-3 pl-12 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset @sm/plan-layout:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem] @sm/plan-layout:items-center @sm/plan-layout:gap-4"
                    :class="selectedCategoryId === category.id && 'bg-primary/5 ring-primary/30 ring-1 ring-inset'"
                    role="button"
                    tabindex="0"
                    @click="selectCategory({ categoryId: category.id })"
                    @keydown.enter="selectCategory({ categoryId: category.id })"
                    @keydown.space.prevent="selectCategory({ categoryId: category.id })"
                  >
                    <div class="min-w-0">
                      <div class="flex items-center justify-between gap-3">
                        <span class="truncate">{{ category.name }}</span>
                        <span
                          v-if="category.status !== 'none'"
                          class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                          :class="
                            category.status === 'overspent'
                              ? 'bg-destructive/10 text-destructive-text'
                              : category.status === 'underfunded'
                                ? 'bg-warning/10 text-warning-text'
                                : 'bg-success/10 text-success-text'
                          "
                        >
                          {{ $t(`plan.status.${category.status}`) }}
                        </span>
                      </div>
                      <div class="bg-muted mt-2 h-1 overflow-hidden rounded-full">
                        <div
                          class="bg-success h-full rounded-full transition-[width] duration-200"
                          :style="{ width: `${coveragePercent({ category })}%` }"
                        />
                      </div>
                      <p v-if="category.target" class="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                        <TargetIcon class="size-3" aria-hidden="true" />
                        {{ formatMoney(category.target.monthlyAmount) }} {{ $t('plan.target.perMonth') }}
                      </p>
                    </div>
                    <InputField
                      :model-value="editingAssignments[category.id] ?? category.assigned"
                      type="number"
                      :label="$t('plan.columns.assigned')"
                      :placeholder="$t('plan.assignment.placeholder')"
                      non-label-wrapper
                      class="[&_label]:sr-only"
                      :aria-label="$t('plan.assignment.ariaLabel', { category: category.name })"
                      @click.stop
                      @focus="beginAssignment({ categoryId: category.id, assigned: category.assigned })"
                      @update:model-value="(value) => (editingAssignments[category.id] = String(value ?? ''))"
                      @blur="commitAssignment({ categoryId: category.id, fallback: category.assigned })"
                      @keyup.enter="commitAssignment({ categoryId: category.id, fallback: category.assigned })"
                      @keyup.escape="cancelAssignment({ categoryId: category.id })"
                    />
                    <span
                      class="hidden text-right tabular-nums @sm/plan-layout:block"
                      :class="category.activity < 0 ? 'text-app-expense-color' : 'text-app-income-color'"
                      >{{ formatMoney(category.activity) }}</span
                    >
                    <span
                      class="text-right font-medium tabular-nums"
                      :class="category.available < 0 ? 'text-app-expense-color' : ''"
                      >{{ formatMoney(category.available) }}</span
                    >
                  </div>
                </template>
              </section>
            </div>
          </main>

          <aside
            v-if="selectedCategory && !isMobileView"
            class="border-border bg-card h-fit min-w-0 rounded-2xl border p-5 @lg/plan-layout:sticky @lg/plan-layout:top-4"
          >
            <CategoryInspectorContent
              :category="selectedCategory"
              :parent-name="selectedParentName"
              :currency-code="planViewQuery.data.value.plan.baseCurrencyCode"
              :period-start="periodStart"
              :can-allocate="planViewQuery.data.value.plan.canAllocate"
              @close="selectedCategoryId = null"
              @edit="startEditCategory"
              @add-subcategory="startCreateCategory({ parent: selectedCategory ?? undefined })"
              @save-target="saveSelectedCategoryTarget"
              @delete-target="deleteSelectedCategoryTarget"
            />
          </aside>
        </div>
      </template>
    </div>

    <ResponsiveDialog v-if="selectedCategory && isMobileView" v-model:open="isCategoryInspectorOpen" sr-only-header>
      <template #title>{{ selectedCategory.name }}</template>
      <template #description>{{ $t('plan.categoryInspector.description') }}</template>
      <CategoryInspectorContent
        :category="selectedCategory"
        :parent-name="selectedParentName"
        :currency-code="planViewQuery.data.value?.plan.baseCurrencyCode ?? 'EUR'"
        :period-start="periodStart"
        :can-allocate="planViewQuery.data.value?.plan.canAllocate ?? false"
        @close="isCategoryInspectorOpen = false"
        @edit="startEditCategory"
        @add-subcategory="startCreateCategory({ parent: selectedCategory ?? undefined })"
        @save-target="saveSelectedCategoryTarget"
        @delete-target="deleteSelectedCategoryTarget"
      />
    </ResponsiveDialog>

    <ResponsiveAlertDialog
      v-model:open="isDeleteDialogOpen"
      :confirm-label="String($t('plan.delete.confirm'))"
      confirm-variant="destructive"
      :confirm-disabled="Boolean(planViewQuery.data.value?.plan.isDefault) || deleteMutation.isPending.value"
      @confirm="deleteMutation.mutate()"
    >
      <template #title>{{ $t('plan.delete.title') }}</template>
      <template #description>
        <span v-if="planViewQuery.data.value?.plan.isDefault">{{ $t('plan.delete.defaultDescription') }}</span>
        <span v-else>{{ $t('plan.delete.description', { name: selectedPlan?.name ?? '' }) }}</span>
      </template>
    </ResponsiveAlertDialog>

    <CategoryFormDialog
      v-model:open="isCategoryFormOpen"
      :category="categoryFormCategory"
      :parent-category="categoryFormParent"
      @saved="handleCategorySaved"
    />

    <ResponsiveDialog v-model:open="isMoveDialogOpen">
      <template #title>{{ $t('plan.move.title') }}</template>
      <template #description>{{ $t('plan.move.description') }}</template>
      <div class="grid gap-4">
        <SelectField
          :model-value="moveSource"
          :values="categoryRows"
          :label="String($t('plan.move.source'))"
          label-key="name"
          value-key="id"
          :placeholder="String($t('plan.move.sourcePlaceholder'))"
          @update:model-value="(value) => (moveSource = value)"
        />
        <SelectField
          :model-value="moveDestination"
          :values="categoryRows"
          :label="String($t('plan.move.destination'))"
          label-key="name"
          value-key="id"
          :placeholder="String($t('plan.move.destinationPlaceholder'))"
          @update:model-value="(value) => (moveDestination = value)"
        />
        <InputField
          v-model="moveAmount"
          type="number"
          :label="$t('plan.move.amount')"
          :placeholder="$t('plan.move.amountPlaceholder')"
        />
      </div>
      <template #footer="{ close }">
        <UiButton variant="outline" @click="close">{{ $t('common.actions.cancel') }}</UiButton>
        <UiButton
          :disabled="!moveSource || !moveDestination || !moveAmount || moveMutation.isPending.value"
          :loading="moveMutation.isPending.value"
          @click="moveMutation.mutate()"
          >{{ $t('plan.actions.moveMoney') }}</UiButton
        >
      </template>
    </ResponsiveDialog>

    <ResponsiveDialog v-model:open="isAutoAssignDialogOpen">
      <template #title>{{ $t('plan.autoAssign.title') }}</template>
      <template #description>{{ $t('plan.autoAssign.description') }}</template>
      <div v-if="autoAssignPreviewData" class="grid gap-2">
        <p class="text-sm">
          {{ $t('plan.autoAssign.remaining', { amount: formatMoney(autoAssignPreviewData.readyToAssignAfter) }) }}
        </p>
        <div
          v-for="change in autoAssignPreviewData.changes"
          :key="change.categoryId"
          class="flex justify-between text-sm"
        >
          <span>{{ categoryRows.find((row) => row.id === change.categoryId)?.name }}</span>
          <span class="tabular-nums"
            >{{ formatMoney(change.currentAssigned) }} → {{ formatMoney(change.proposedAssigned) }}</span
          >
        </div>
        <p v-if="!autoAssignPreviewData.changes.length" class="text-muted-foreground text-sm">
          {{ $t('plan.autoAssign.noChanges') }}
        </p>
      </div>
      <template #footer="{ close }">
        <UiButton variant="outline" @click="close">{{ $t('common.actions.cancel') }}</UiButton>
        <UiButton
          :disabled="!autoAssignPreviewData?.changes.length || autoAssignMutation.isPending.value"
          :loading="autoAssignMutation.isPending.value"
          @click="autoAssignMutation.mutate()"
          >{{ $t('plan.autoAssign.confirm') }}</UiButton
        >
      </template>
    </ResponsiveDialog>

    <ResponsiveDialog v-model:open="isCreateDialogOpen">
      <template #title>{{ $t('plan.create.title') }}</template>
      <template #description>{{ $t('plan.create.description') }}</template>
      <div class="grid gap-4">
        <InputField
          v-model="planName"
          :label="$t('plan.create.nameLabel')"
          :placeholder="$t('plan.create.namePlaceholder')"
        />
        <div class="bg-primary/10 text-primary-text flex items-start gap-3 rounded-xl p-3">
          <Checkbox id="plan-include-historical-transactions" v-model="includeHistoricalTransactions" class="mt-0.5" />
          <div class="grid gap-1 text-sm leading-5">
            <label for="plan-include-historical-transactions" class="cursor-pointer font-medium">{{
              $t('plan.create.includeHistoricalLabel')
            }}</label>
            <p>
              {{
                $t(
                  includeHistoricalTransactions
                    ? 'plan.create.includeHistoricalDescription'
                    : 'plan.create.freshStartDescription',
                )
              }}
            </p>
          </div>
        </div>
        <p class="text-muted-foreground text-sm">
          {{ $t('plan.create.currency', { currency: baseCurrencyQuery.data.value?.currencyCode ?? '' }) }}
        </p>
      </div>
      <template #footer="{ close }">
        <UiButton variant="outline" @click="close">{{ $t('common.actions.cancel') }}</UiButton>
        <UiButton
          :disabled="createMutation.isPending.value || !planName.trim()"
          :loading="createMutation.isPending.value"
          @click="createMutation.mutate()"
          >{{ $t('plan.actions.create') }}</UiButton
        >
      </template>
    </ResponsiveDialog>
  </PageWrapper>
</template>
