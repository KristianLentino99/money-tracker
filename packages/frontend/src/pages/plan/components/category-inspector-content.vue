<script setup lang="ts">
import DateField from '@/components/fields/date-field.vue';
import { InputField } from '@/components/fields';
import DesktopOnlyTooltip from '@/components/lib/ui/tooltip/desktop-only-tooltip.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { differenceInCalendarMonths, format, parseISO, startOfMonth, addMonths } from 'date-fns';
import { CircleCheckIcon, PencilIcon, PlusIcon, TargetIcon, Trash2Icon, XIcon } from '@lucide/vue';
import type { endpointsTypes } from '@bt/shared/types';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  category: endpointsTypes.PlanCategoryRowResponse;
  parentName: string | null;
  currencyCode: string;
  periodStart: string;
  canAllocate: boolean;
}>();

const emit = defineEmits<{
  close: [];
  edit: [];
  addSubcategory: [];
  saveTarget: [payload: { amount: number; dueDate: string }];
  deleteTarget: [];
}>();

const { t } = useI18n();

const isTargetEditorOpen = ref(false);
const targetAmount = ref<number | null>(null);
const targetDueDate = ref(new Date());

const formatMoney = (amount: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: props.currencyCode,
  }).format(amount);

const formatDate = (date: string) => format(parseISO(date), 'd MMM yyyy');

const syncTargetEditor = () => {
  if (props.category.target) {
    targetAmount.value = props.category.target.amount;
    targetDueDate.value = parseISO(props.category.target.dueDate);
    return;
  }
  targetAmount.value = null;
  targetDueDate.value = addMonths(parseISO(props.periodStart), 12);
};

watch([() => props.category.target, () => props.periodStart], syncTargetEditor, { immediate: true });

const targetPreviewMonthlyAmount = computed(() => {
  const amount = targetAmount.value;
  if (!amount || amount <= 0 || !Number.isFinite(amount)) return 0;
  const saved = props.category.target?.savedAmount ?? 0;
  const remaining = Math.max(0, amount - saved);
  const months = Math.max(
    1,
    differenceInCalendarMonths(startOfMonth(targetDueDate.value), startOfMonth(parseISO(props.periodStart))),
  );
  const monthly = remaining / months;
  return Math.ceil(monthly * 100) / 100;
});

const openTargetEditor = () => {
  syncTargetEditor();
  isTargetEditorOpen.value = true;
};

const saveTarget = () => {
  if (!targetAmount.value || targetAmount.value <= 0 || !Number.isFinite(targetAmount.value)) return;
  emit('saveTarget', {
    amount: targetAmount.value,
    dueDate: format(targetDueDate.value, 'yyyy-MM-dd'),
  });
  isTargetEditorOpen.value = false;
};

const deleteTarget = () => {
  emit('deleteTarget');
  isTargetEditorOpen.value = false;
};

const statusLabel = computed(() =>
  props.category.status === 'none' ? t('plan.categoryInspector.noStatus') : t(`plan.status.${props.category.status}`),
);

const statusClass = computed(() => {
  if (props.category.status === 'overspent') return 'bg-destructive/10 text-destructive-text';
  if (props.category.status === 'underfunded') return 'bg-warning/10 text-warning-text';
  if (props.category.status === 'funded') return 'bg-success/10 text-success-text';
  return 'bg-muted text-muted-foreground';
});
</script>

<template>
  <div class="grid gap-5">
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-start gap-3">
        <div class="bg-primary/10 text-primary-text grid size-10 shrink-0 place-items-center rounded-xl">
          <TargetIcon class="size-5" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <p v-if="parentName" class="text-muted-foreground mb-1 text-xs">{{ parentName }}</p>
          <h2 class="text-foreground truncate text-lg font-semibold text-balance">{{ category.name }}</h2>
          <span :class="['mt-2 inline-flex rounded-full px-2 py-1 text-xs font-medium', statusClass]">{{
            statusLabel
          }}</span>
        </div>
      </div>
      <DesktopOnlyTooltip :content="String($t('common.actions.close'))">
        <UiButton
          variant="ghost"
          size="icon-sm"
          :aria-label="String($t('common.actions.close'))"
          @click="emit('close')"
        >
          <XIcon class="size-4" aria-hidden="true" />
        </UiButton>
      </DesktopOnlyTooltip>
    </div>

    <div class="border-border grid grid-cols-3 divide-x rounded-xl border">
      <div class="grid gap-1 p-3">
        <span class="text-muted-foreground text-xs">{{ $t('plan.columns.assigned') }}</span>
        <strong class="text-sm tabular-nums">{{ formatMoney(category.assigned) }}</strong>
      </div>
      <div class="grid gap-1 p-3">
        <span class="text-muted-foreground text-xs">{{ $t('plan.columns.activity') }}</span>
        <strong
          class="text-sm tabular-nums"
          :class="category.activity < 0 ? 'text-app-expense-color' : 'text-app-income-color'"
        >
          {{ formatMoney(category.activity) }}
        </strong>
      </div>
      <div class="grid gap-1 p-3">
        <span class="text-muted-foreground text-xs">{{ $t('plan.columns.available') }}</span>
        <strong class="text-sm tabular-nums" :class="category.available < 0 ? 'text-app-expense-color' : ''">
          {{ formatMoney(category.available) }}
        </strong>
      </div>
    </div>

    <div class="border-border bg-muted/20 grid gap-4 rounded-xl border p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-2">
          <TargetIcon class="text-primary-text mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <h3 class="text-sm font-semibold">{{ $t('plan.target.title') }}</h3>
            <p class="text-muted-foreground mt-1 text-xs leading-5">{{ $t('plan.target.description') }}</p>
          </div>
        </div>
        <DesktopOnlyTooltip v-if="category.target && canAllocate" :content="String($t('plan.target.edit'))">
          <UiButton
            variant="ghost"
            size="icon-sm"
            :aria-label="String($t('plan.target.edit'))"
            @click="openTargetEditor"
          >
            <PencilIcon class="size-4" aria-hidden="true" />
          </UiButton>
        </DesktopOnlyTooltip>
      </div>

      <template v-if="category.target">
        <div class="flex items-end justify-between gap-4">
          <div>
            <p class="text-muted-foreground text-xs">{{ $t('plan.target.saved') }}</p>
            <p class="mt-1 text-lg font-semibold tabular-nums">{{ formatMoney(category.target.savedAmount) }}</p>
          </div>
          <div class="text-right">
            <p class="text-muted-foreground text-xs">{{ $t('plan.target.toGo') }}</p>
            <p class="mt-1 text-lg font-semibold tabular-nums">{{ formatMoney(category.target.remaining) }}</p>
          </div>
        </div>
        <div class="grid gap-2">
          <div
            class="bg-muted h-2 overflow-hidden rounded-full"
            role="progressbar"
            :aria-label="String($t('plan.target.progress'))"
            :aria-valuenow="category.target.progressPercent"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="bg-primary h-full rounded-full transition-[width] duration-200"
              :style="{ width: `${category.target.progressPercent}%` }"
            />
          </div>
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="text-muted-foreground"
              >{{ formatMoney(category.target.amount) }} {{ $t('plan.target.by') }}</span
            >
            <span class="font-medium">{{ formatDate(category.target.dueDate) }}</span>
          </div>
        </div>
        <div
          class="flex items-start gap-2 rounded-lg p-3 text-sm"
          :class="category.target.isOnTrack ? 'bg-success/10 text-success-text' : 'bg-warning/10 text-warning-text'"
        >
          <CircleCheckIcon v-if="category.target.isOnTrack" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <TargetIcon v-else class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong class="font-semibold">
              {{ formatMoney(category.target.monthlyAmount) }} {{ $t('plan.target.perMonth') }}
            </strong>
            {{ category.target.isOnTrack ? $t('plan.target.onTrack') : $t('plan.target.needsAttention') }}
          </span>
        </div>
        <UiButton v-if="canAllocate && !isTargetEditorOpen" variant="outline" class="w-full" @click="openTargetEditor">
          <PencilIcon class="size-4" aria-hidden="true" />
          {{ $t('plan.target.edit') }}
        </UiButton>
      </template>
      <template v-else>
        <div class="grid gap-3">
          <p class="text-muted-foreground text-sm leading-6">{{ $t('plan.target.empty') }}</p>
          <UiButton v-if="canAllocate" variant="outline" class="w-full" @click="openTargetEditor">
            <PlusIcon class="size-4" aria-hidden="true" />
            {{ $t('plan.target.add') }}
          </UiButton>
        </div>
      </template>

      <div v-if="isTargetEditorOpen" class="border-border grid gap-4 border-t pt-4">
        <div class="flex items-center justify-between gap-2">
          <h4 class="text-sm font-semibold">{{ $t('plan.target.editor.title') }}</h4>
          <UiButton
            variant="ghost"
            size="icon-sm"
            :aria-label="String($t('common.actions.close'))"
            @click="isTargetEditorOpen = false"
          >
            <XIcon class="size-4" aria-hidden="true" />
          </UiButton>
        </div>
        <InputField
          v-model="targetAmount"
          type="number"
          only-positive
          :label="$t('plan.target.editor.amount')"
          :placeholder="$t('plan.target.editor.amountPlaceholder')"
        />
        <DateField
          v-model="targetDueDate"
          :label="$t('plan.target.editor.dueDate')"
          :calendar-options="{ minDate: new Date() }"
        />
        <p class="bg-primary/10 text-primary-text rounded-lg p-3 text-sm leading-5">
          {{ $t('plan.target.editor.monthlyHint', { amount: formatMoney(targetPreviewMonthlyAmount) }) }}
        </p>
        <div class="flex flex-wrap justify-between gap-2">
          <UiButton v-if="category.target" variant="ghost-destructive" @click="deleteTarget">
            <Trash2Icon class="size-4" aria-hidden="true" />
            {{ $t('plan.target.delete') }}
          </UiButton>
          <span v-else />
          <div class="flex gap-2">
            <UiButton variant="outline" @click="isTargetEditorOpen = false">{{ $t('common.actions.cancel') }}</UiButton>
            <UiButton :disabled="!targetAmount || targetAmount <= 0" @click="saveTarget">
              {{ $t('plan.target.save') }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <div v-if="category.upcomingObligation !== null" class="bg-warning/10 text-warning-text rounded-xl p-3 text-sm">
      <p class="font-medium">{{ $t('plan.categoryInspector.upcoming') }}</p>
      <p class="mt-1">{{ formatMoney(category.upcomingObligation) }}</p>
    </div>

    <div class="grid gap-2">
      <UiButton variant="outline" class="justify-start" @click="emit('edit')">
        <PencilIcon class="size-4" aria-hidden="true" />
        {{ $t('plan.categoryInspector.edit') }}
      </UiButton>
      <UiButton v-if="category.parentId === null" variant="ghost" class="justify-start" @click="emit('addSubcategory')">
        <PlusIcon class="size-4" aria-hidden="true" />
        {{ $t('plan.categoryInspector.addSubcategory') }}
      </UiButton>
    </div>

    <p class="text-muted-foreground border-border border-t pt-4 text-sm leading-6">
      {{ $t('plan.categoryInspector.hint') }}
    </p>
  </div>
</template>
