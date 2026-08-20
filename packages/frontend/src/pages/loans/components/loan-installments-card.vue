<script setup lang="ts">
import { linkInstallmentToLoan } from '@/api/subscriptions';
import Button from '@/components/lib/ui/button/Button.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import InputField from '@/components/fields/input-field.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useSubscriptionsList, useInvalidateSubscriptionQueries } from '@/composable/data-queries/subscriptions';
import { useInvalidateLoanQueries } from '@/composable/data-queries/loans';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable/formatters';
import { ROUTES_NAMES } from '@/routes';
import type { LoanApi, LoanInstallmentApiResponse } from '@/api/loans';
import QuickAddSubscriptionDialog from '@/pages/planned/subscriptions/components/quick-add-subscription-dialog.vue';
import type { QuickAddFormState } from '@/pages/planned/subscriptions/quick-add-payload';
import { SUBSCRIPTION_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { LinkIcon, PlusIcon, SearchIcon } from '@lucide/vue';
import { addMonths } from 'date-fns';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const props = defineProps<{ loan: LoanApi; canManage: boolean }>();

const { t } = useI18n();
const router = useRouter();
const { addErrorNotification, addSuccessNotification } = useNotificationCenter();
const { formatAmountByCurrencyCode } = useFormatCurrency();
const invalidateLoanQueries = useInvalidateLoanQueries();
const invalidateSubscriptionQueries = useInvalidateSubscriptionQueries();

const isLinkDialogOpen = ref(false);
const isCreateDialogOpen = ref(false);
const search = ref('');
const selectedIds = ref<Set<string>>(new Set());
const isSubmitting = ref(false);

const {
  data: installments,
  isLoading,
  refetch,
} = useSubscriptionsList({
  filter: { type: SUBSCRIPTION_TYPES.installment },
  staleTime: 0,
});

const linkedInstallments = computed(() => props.loan.loanInstallments ?? []);

const availableInstallments = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  const linkedIds = new Set(linkedInstallments.value.map((installment) => installment.id));

  return (installments.value ?? []).filter((installment) => {
    if (installment.type !== SUBSCRIPTION_TYPES.installment) return false;
    if (installment.transactionType !== TRANSACTION_TYPES.expense) return false;
    if (installment.loanAccountId != null || linkedIds.has(installment.id)) return false;
    return query.length === 0 || installment.name.toLocaleLowerCase().includes(query);
  });
});

const toggleSelection = ({ id }: { id: string }) => {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
};

const openLinkDialog = async () => {
  search.value = '';
  selectedIds.value = new Set();
  isLinkDialogOpen.value = true;
  await refetch();
};

const createPrefill = computed<Partial<QuickAddFormState>>(() => ({
  name: `${props.loan.name} installment`,
  type: SUBSCRIPTION_TYPES.installment,
  transactionType: TRANSACTION_TYPES.expense,
  expectedAmount: props.loan.loanDetails.plannedPayment ?? props.loan.loanDetails.minPayment,
  expectedCurrencyCode: props.loan.currencyCode,
  nextPaymentDate: addMonths(new Date(), 1),
  maxOccurrences: props.loan.loanDetails.termMonths ?? 12,
  accountId: null,
}));

const handleCreated = async ({ subscription }: { subscription: { id: string } }) => {
  try {
    await linkInstallmentToLoan({ id: subscription.id, loanAccountId: props.loan.id });
    invalidateLoanQueries();
    invalidateSubscriptionQueries();
    addSuccessNotification(t('loans.detail.installments.linkSuccess'));
    openInstallment({ id: subscription.id });
  } catch {
    addErrorNotification(t('loans.detail.installments.linkError'));
  }
};

const linkSelected = async () => {
  if (selectedIds.value.size === 0 || isSubmitting.value) return;
  isSubmitting.value = true;

  try {
    await Promise.all(
      [...selectedIds.value].map((subscriptionId) =>
        linkInstallmentToLoan({ id: subscriptionId, loanAccountId: props.loan.id }),
      ),
    );
    invalidateLoanQueries();
    invalidateSubscriptionQueries();
    isLinkDialogOpen.value = false;
    addSuccessNotification(t('loans.detail.installments.linkSuccess'));
  } catch {
    addErrorNotification(t('loans.detail.installments.linkError'));
  } finally {
    isSubmitting.value = false;
  }
};

const openInstallment = ({ id }: { id: string }) => {
  router.push({ name: ROUTES_NAMES.subscriptionDetails, params: { id } });
};

const installmentProgress = ({ installment }: { installment: LoanInstallmentApiResponse }) => {
  if (installment.maxOccurrences == null) return `${installment.paidPeriodsCount}`;
  return `${installment.paidPeriodsCount}/${installment.maxOccurrences}`;
};

const installmentAmount = ({ installment }: { installment: LoanInstallmentApiResponse }) => {
  if (installment.expectedAmount == null || installment.expectedCurrencyCode == null) return null;
  return formatAmountByCurrencyCode(installment.expectedAmount, installment.expectedCurrencyCode);
};

watch(isLinkDialogOpen, (open) => {
  if (!open) selectedIds.value = new Set();
});
</script>

<template>
  <Card class="@container/loan-installments">
    <CardHeader class="flex flex-row items-start justify-between gap-3 space-y-0">
      <div class="min-w-0">
        <h2 class="text-base font-semibold">{{ $t('loans.detail.installments.title') }}</h2>
        <p class="text-muted-foreground mt-1 text-sm">{{ $t('loans.detail.installments.description') }}</p>
      </div>
      <div v-if="canManage" class="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" @click="isCreateDialogOpen = true">
          <PlusIcon class="size-4" />
          <span class="hidden @sm/loan-installments:inline">{{ $t('planned.subscriptions.addSubscription') }}</span>
        </Button>
        <Button variant="outline" size="sm" @click="openLinkDialog">
          <LinkIcon class="size-4" />
          <span class="hidden @sm/loan-installments:inline">{{ $t('loans.detail.installments.linkAction') }}</span>
        </Button>
      </div>
    </CardHeader>

    <CardContent>
      <div v-if="linkedInstallments.length === 0" class="bg-muted/40 rounded-lg border border-dashed p-4">
        <p class="text-sm font-medium">{{ $t('loans.detail.installments.emptyTitle') }}</p>
        <p class="text-muted-foreground mt-1 text-sm">{{ $t('loans.detail.installments.emptyDescription') }}</p>
      </div>

      <div v-else class="divide-border divide-y rounded-lg border">
        <button
          v-for="installment in linkedInstallments"
          :key="installment.id"
          type="button"
          class="hover:bg-muted/40 focus-visible:ring-ring flex w-full items-center gap-3 p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
          @click="openInstallment({ id: installment.id })"
        >
          <div class="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <LinkIcon class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">{{ installment.name }}</div>
            <div class="text-muted-foreground mt-0.5 text-xs">
              {{ $t('loans.detail.installments.progress', { progress: installmentProgress({ installment }) }) }}
              <span v-if="installmentAmount({ installment })"> · {{ installmentAmount({ installment }) }}</span>
            </div>
          </div>
          <span v-if="!installment.isActive" class="text-muted-foreground text-xs">
            {{ $t('loans.detail.installments.paused') }}
          </span>
        </button>
      </div>
    </CardContent>
  </Card>

  <ResponsiveDialog v-model:open="isLinkDialogOpen" dialog-content-class="max-w-lg">
    <template #title>{{ $t('loans.detail.installments.dialogTitle') }}</template>
    <template #description>{{ $t('loans.detail.installments.dialogDescription') }}</template>

    <div class="grid gap-4">
      <InputField
        v-model="search"
        :label="$t('loans.detail.installments.searchLabel')"
        :placeholder="$t('loans.detail.installments.searchPlaceholder')"
      >
        <template #iconLeading><SearchIcon class="size-4" /></template>
      </InputField>

      <div v-if="isLoading" class="text-muted-foreground py-6 text-center text-sm">
        {{ $t('loans.detail.installments.loading') }}
      </div>
      <div v-else-if="availableInstallments.length === 0" class="bg-muted/40 rounded-lg border border-dashed p-4">
        <p class="text-sm">{{ $t('loans.detail.installments.noResults') }}</p>
      </div>
      <div v-else class="max-h-72 divide-y overflow-y-auto rounded-lg border">
        <label
          v-for="installment in availableInstallments"
          :key="installment.id"
          class="hover:bg-muted/40 flex cursor-pointer items-start gap-3 p-3 transition-colors"
        >
          <Checkbox
            :model-value="selectedIds.has(installment.id)"
            class="mt-0.5"
            @update:model-value="toggleSelection({ id: installment.id })"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ installment.name }}</span>
            <span class="text-muted-foreground mt-0.5 block text-xs">
              {{ $t('planned.subscriptions.typeInstallment') }}
              <span v-if="installment.expectedAmount && installment.expectedCurrencyCode">
                · {{ formatAmountByCurrencyCode(installment.expectedAmount, installment.expectedCurrencyCode) }}
              </span>
            </span>
          </span>
        </label>
      </div>
    </div>

    <template #footer>
      <Button variant="outline" :disabled="isSubmitting" @click="isLinkDialogOpen = false">
        {{ $t('common.cancel') }}
      </Button>
      <Button :disabled="selectedIds.size === 0 || isSubmitting" @click="linkSelected">
        <PlusIcon class="size-4" />
        {{ $t('loans.detail.installments.confirmLink', { count: selectedIds.size }) }}
      </Button>
    </template>
  </ResponsiveDialog>

  <QuickAddSubscriptionDialog
    v-model:open="isCreateDialogOpen"
    :prefill="createPrefill"
    stay-on-page
    @created="handleCreated({ subscription: $event })"
  />
</template>
