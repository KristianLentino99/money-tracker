<template>
  <label
    class="border-input bg-input-background flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm"
  >
    <Checkbox
      :model-value="modelValue"
      :aria-label="$t('transactions.filters.uncategorized')"
      @update:model-value="$emit('update:modelValue', $event === true)"
    />
    <span>{{ $t('transactions.filters.uncategorized') }}</span>
  </label>
</template>

<script lang="ts" setup>
import { Checkbox } from '@/components/lib/ui/checkbox';

defineProps<{
  modelValue: boolean;
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
}>();
</script>
