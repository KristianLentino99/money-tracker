<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import RecurringPaymentSelectField from '@/components/fields/recurring-payment-select-field.vue';
import type { TRANSACTION_TYPES } from '@bt/shared/types';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  open: boolean;
  transactionCount: number;
  transactionType: TRANSACTION_TYPES | null;
  hasMixedTransactionTypes: boolean;
  isLoading: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  link: [subscriptionId: string];
}>();

const { t } = useI18n();
const selectedSubscriptionId = ref<string | null>(null);

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

const isLinkDisabled = computed(
  () => props.isLoading || props.hasMixedTransactionTypes || !selectedSubscriptionId.value,
);

watch(isOpen, (open) => {
  if (open) selectedSubscriptionId.value = null;
});

const submit = () => {
  if (isLinkDisabled.value || !selectedSubscriptionId.value) return;
  emit('link', selectedSubscriptionId.value);
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #title>{{ t('transactions.bulkLinkSubscription.title') }}</template>
    <template #description>
      {{ t('transactions.bulkLinkSubscription.description', { count: transactionCount }) }}
    </template>

    <div class="grid gap-4">
      <p v-if="hasMixedTransactionTypes" class="text-warning-text text-sm">
        {{ t('transactions.bulkLinkSubscription.mixedTypes') }}
      </p>
      <RecurringPaymentSelectField
        v-else
        v-model="selectedSubscriptionId"
        :transaction-type="transactionType ?? undefined"
        :label="t('transactions.bulkLinkSubscription.selectLabel')"
        :placeholder="t('transactions.bulkLinkSubscription.selectPlaceholder')"
        :disabled="isLoading"
      />
    </div>

    <template #footer>
      <Button variant="outline" :disabled="isLoading" @click="isOpen = false">
        {{ t('common.ui.cancel') }}
      </Button>
      <Button :disabled="isLinkDisabled" :loading="isLoading" @click="submit">
        {{ t('transactions.bulkLinkSubscription.confirmButton') }}
      </Button>
    </template>
  </ResponsiveDialog>
</template>
