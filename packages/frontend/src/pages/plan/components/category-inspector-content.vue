<script setup lang="ts">
import DesktopOnlyTooltip from '@/components/lib/ui/tooltip/desktop-only-tooltip.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { PencilIcon, PlusIcon, TagIcon, XIcon } from '@lucide/vue';
import type { endpointsTypes } from '@bt/shared/types';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  category: endpointsTypes.PlanCategoryRowResponse;
  parentName: string | null;
  currencyCode: string;
}>();

const emit = defineEmits<{
  close: [];
  edit: [];
  addSubcategory: [];
}>();

const { t } = useI18n();

const formatMoney = (amount: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: props.currencyCode,
  }).format(amount);

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
          <TagIcon class="size-5" aria-hidden="true" />
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
