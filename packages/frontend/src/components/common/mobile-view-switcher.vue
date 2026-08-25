<template>
  <div class="bg-card flex items-center gap-0.5 rounded-md border p-0.5" role="group" :aria-label="label">
    <DesktopOnlyTooltip :content="listLabel">
      <UiButton
        :variant="modelValue === 'list' ? 'secondary' : 'ghost'"
        size="icon-sm"
        class="min-h-11 min-w-11"
        :aria-label="listLabel"
        :aria-pressed="modelValue === 'list'"
        @click="emit('update:modelValue', 'list')"
      >
        <ListIcon class="size-4" aria-hidden="true" />
      </UiButton>
    </DesktopOnlyTooltip>
    <DesktopOnlyTooltip :content="tableLabel">
      <UiButton
        :variant="modelValue === 'table' ? 'secondary' : 'ghost'"
        size="icon-sm"
        class="min-h-11 min-w-11"
        :aria-label="tableLabel"
        :aria-pressed="modelValue === 'table'"
        @click="emit('update:modelValue', 'table')"
      >
        <Table2Icon class="size-4" aria-hidden="true" />
      </UiButton>
    </DesktopOnlyTooltip>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { ListIcon, Table2Icon } from '@lucide/vue';

defineProps<{
  modelValue: 'list' | 'table';
  label: string;
  listLabel: string;
  tableLabel: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: 'list' | 'table'];
}>();
</script>
