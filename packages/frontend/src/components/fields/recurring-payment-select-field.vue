<template>
  <SelectField
    :model-value="selectedSubscription"
    :values="visibleSubscriptions"
    value-key="id"
    :label-key="getLabel"
    :search-keys="['name']"
    with-search
    clearable
    :label="label"
    :placeholder="placeholder"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', $event?.id ?? null)"
  />
</template>

<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import { type SubscriptionListItem } from '@/api/subscriptions';
import { useSubscriptionsList } from '@/composable/data-queries/subscriptions';
import type { TRANSACTION_TYPES } from '@bt/shared/types';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: string | null | undefined;
    transactionType?: TRANSACTION_TYPES;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    transactionType: undefined,
    label: undefined,
    placeholder: undefined,
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

const { list } = useSubscriptionsList({ filter: { isActive: true } });

const visibleSubscriptions = computed(() =>
  props.transactionType ? list.value.filter((item) => item.transactionType === props.transactionType) : list.value,
);

const selectedSubscription = computed<SubscriptionListItem | null>(
  () => visibleSubscriptions.value.find((item) => item.id === props.modelValue) ?? null,
);

const getLabel = ({ name }: SubscriptionListItem) => name;
</script>
