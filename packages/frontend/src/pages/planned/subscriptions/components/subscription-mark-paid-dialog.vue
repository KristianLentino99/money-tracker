<script setup lang="ts">
import {
  getSubscriptionPayPreview,
  markSubscriptionPeriodPaid,
  type SubscriptionPayPreview,
} from '@/api/subscriptions';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { getAccountDisplayLabel } from '@/common/utils/account-display';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import PickTransactionDialog from '@/components/dialogs/pick-transaction-dialog.vue';
import AccountSelectField from '@/components/fields/account-select-field.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Label } from '@/components/lib/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/lib/ui/radio-group';
import { useNotificationCenter } from '@/components/notification-center';
import { useInvalidateSubscriptionQueries } from '@/composable/data-queries/subscriptions';
import { useFormatCurrency } from '@/composable/formatters';
import { useAccountDropdownPrefs } from '@/composable/use-account-dropdown-prefs';
import { isTransactionOnDate } from '@/components/dialogs/pick-transaction-dialog.helpers';
import { ApiErrorResponseError, isApiErrorWithCode } from '@/js/errors';
import { cn } from '@/lib/utils';
import { useAccountsStore } from '@/stores';
import {
  API_ERROR_CODES,
  TRANSACTION_TYPES,
  type AccountModel,
  type LoanPaymentOverpayDetails,
  type TransactionModel,
} from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Minimal subscription shape the pay flow needs. Accepts both list items and
 * detail models since both carry these fields.
 */
interface PayableSubscription {
  id: string;
  name: string;
  /** Decimal expected amount; null means the amount varies per payment. */
  expectedAmount: number | null;
  expectedCurrencyCode: string | null;
  transactionType: TRANSACTION_TYPES;
  /** Account the generated expense is booked against. null = no account yet. */
  accountId: string | null;
  loan?: { currencyCode: string } | null;
  periodDueDate?: string;
}

/** How an account-less payment is recorded: status-only vs. a booked expense. */
type RecordMode = 'mark' | 'transaction' | 'link';

const { t } = useI18n();
const queryClient = useQueryClient();
const invalidateSubscriptionQueries = useInvalidateSubscriptionQueries();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const { accountsRecord } = storeToRefs(accountsStore);
const { resolveDefaultAccount } = useAccountDropdownPrefs();

const emit = defineEmits<{
  paid: [];
}>();

const { mutate: markPaid, isPending } = useMutation({
  mutationFn: markSubscriptionPeriodPaid,
  onSuccess: () => {
    invalidateSubscriptionQueries();
    // Booking an expense creates a transaction, so refresh all transaction-aware queries.
    queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
    addSuccessNotification(t('dialogs.subscriptionMarkPaid.notifications.markedAsPaid'));
    isDialogOpen.value = false;
    emit('paid');
  },
  onError(error) {
    if (isApiErrorWithCode(error, API_ERROR_CODES.loanPaymentOverpayConfirmationRequired)) {
      overpayDetails.value = (error.data.details as LoanPaymentOverpayDetails | undefined) ?? null;
      isOverpayConfirmOpen.value = true;
      return;
    }

    isOverpayConfirmOpen.value = false;
    const message =
      error instanceof ApiErrorResponseError
        ? error.data.message
        : t('dialogs.subscriptionMarkPaid.notifications.markAsPaidFailed');
    addErrorNotification(message ?? t('dialogs.subscriptionMarkPaid.notifications.markAsPaidFailed'));
  },
});

// --- Dialog state ---

const isDialogOpen = ref(false);
const activeSubscription = ref<PayableSubscription | null>(null);
const activePeriodId = ref<string | null>(null);
const activePeriodDueDate = ref<string | null>(null);
const pendingPayPayload = ref<Parameters<typeof markSubscriptionPeriodPaid>[0] | null>(null);
const amount = ref<string>('');
const paidDate = ref<Date>(new Date());
const isEstimateLoading = ref(false);
const estimate = ref<SubscriptionPayPreview | null>(null);
const today = new Date();

// The user's payment choice and, for account-less subscriptions, the account used to book it.
const recordMode = ref<RecordMode>('mark');
const isLinkTransactionDialogOpen = ref(false);
const selectedAccountId = ref<string | null>(null);
const isOverpayConfirmOpen = ref(false);
const overpayDetails = ref<LoanPaymentOverpayDetails | null>(null);
const { formatAmountByCurrencyCode } = useFormatCurrency();

function submitPay(payload: Parameters<typeof markSubscriptionPeriodPaid>[0]) {
  pendingPayPayload.value = payload;
  markPaid(payload);
}

const overpayAmountDisplay = computed(() => {
  const currencyCode = activeSubscription.value?.loan?.currencyCode ?? activeSubscription.value?.expectedCurrencyCode;
  return overpayDetails.value && currencyCode
    ? formatAmountByCurrencyCode(overpayDetails.value.overpayBy, currencyCode)
    : '';
});

/** A subscription with an account starts in transaction mode; linking stays available from the same dialog. */
const hasAccount = computed(() => activeSubscription.value?.accountId != null);

/** Whether the account/amount/date fields are shown (booking a real transaction). */
const isBooking = computed(() => recordMode.value === 'transaction');

const allAccounts = computed(() => accountsStore.accounts ?? []);

const selectedAccount = computed(() =>
  selectedAccountId.value ? (accountsRecord.value[selectedAccountId.value] ?? null) : null,
);

const accountLabel = computed(() => {
  const accountId = activeSubscription.value?.accountId;
  if (!accountId) return null;
  const account = accountsRecord.value[accountId];
  return account ? getAccountDisplayLabel(account) : null;
});

function accountCurrencyFor(subscription: PayableSubscription | null): string | null {
  if (!subscription?.accountId) return null;
  return accountsRecord.value[subscription.accountId]?.currencyCode ?? null;
}

function isCrossCurrency(subscription: PayableSubscription): boolean {
  const accountCurrency = accountCurrencyFor(subscription);
  return (
    subscription.expectedCurrencyCode != null &&
    accountCurrency != null &&
    subscription.expectedCurrencyCode !== accountCurrency
  );
}

/**
 * The booked amount is always denominated in the account's currency. For an
 * account-less subscription that follows the account the user is selecting; it
 * falls back to the subscription's own currency before one is chosen.
 */
const dialogAmountCurrency = computed(() => {
  const sub = activeSubscription.value;
  if (!sub) return null;
  if (sub.accountId == null) {
    if (selectedAccountId.value) return accountsRecord.value[selectedAccountId.value]?.currencyCode ?? null;
    return sub.expectedCurrencyCode ?? null;
  }
  return accountCurrencyFor(sub) ?? sub.expectedCurrencyCode ?? null;
});

const isConfirmDisabled = computed(() => {
  if (isPending.value) return true;
  if (recordMode.value === 'link') return true;
  // Plain "just mark as paid" needs no input.
  if (!isBooking.value) return false;
  // Booking against a not-yet-linked account requires picking one.
  if (!hasAccount.value && !selectedAccountId.value) return true;
  return !amount.value || Number(amount.value) <= 0;
});

const confirmLabel = computed(() =>
  isBooking.value ? t('dialogs.subscriptionMarkPaid.confirm') : t('dialogs.subscriptionMarkPaid.confirmMarkOnly'),
);

/**
 * Entry point.
 * Opens the payment choices. Existing transactions are linked through the same
 * period-payment request as generated transactions, so marking the period paid
 * and advancing the schedule remain atomic.
 */
async function triggerPay({
  subscription,
  periodId,
  periodDueDate,
}: {
  subscription: PayableSubscription;
  periodId: string;
  periodDueDate?: string;
}) {
  activeSubscription.value = subscription;
  activePeriodId.value = periodId;
  activePeriodDueDate.value = periodDueDate ?? subscription.periodDueDate ?? null;
  recordMode.value = subscription.accountId == null ? 'mark' : 'transaction';
  selectedAccountId.value = resolveDefaultAccount({ accounts: allAccounts.value, fallbackToFirst: false })?.id ?? null;
  amount.value = subscription.expectedAmount != null ? String(subscription.expectedAmount) : '';
  paidDate.value = new Date();
  estimate.value = null;
  isLinkTransactionDialogOpen.value = false;
  isDialogOpen.value = true;

  const crossCurrency = isCrossCurrency(subscription);
  if (crossCurrency) {
    await loadPreviewEstimate({ subscriptionId: subscription.id });
  }
}

watch(recordMode, (mode) => {
  if (mode === 'link' && activePeriodDueDate.value) {
    isLinkTransactionDialogOpen.value = true;
  }
});

watch(isDialogOpen, (open) => {
  if (!open) isLinkTransactionDialogOpen.value = false;
});

function handleLinkedTransaction(transaction: TransactionModel) {
  if (!activeSubscription.value || !activePeriodId.value) return;

  if (
    !activePeriodDueDate.value ||
    !isTransactionOnDate({ transactionTime: transaction.time, transactionDate: activePeriodDueDate.value })
  ) {
    addErrorNotification(t('dialogs.subscriptionMarkPaid.notifications.linkTransactionDateMismatch'));
    return;
  }

  isLinkTransactionDialogOpen.value = false;
  submitPay({
    id: activeSubscription.value.id,
    periodId: activePeriodId.value,
    transactionId: transaction.id,
  });
}

async function loadPreviewEstimate({ subscriptionId }: { subscriptionId: string }) {
  isEstimateLoading.value = true;
  try {
    const preview = await getSubscriptionPayPreview({ id: subscriptionId });
    estimate.value = preview;
    // Pre-fill the account-currency estimate; the user can still edit it to the
    // exact amount their bank charged. Guard against clobbering anything typed
    // while the request was in flight.
    if (preview.convertedAmount != null && amount.value === '') {
      amount.value = String(preview.convertedAmount);
    }
  } catch {
    // The estimate is a convenience: if the rate lookup fails the dialog still
    // works and the user types the amount manually.
  } finally {
    isEstimateLoading.value = false;
  }
}

function confirmPay() {
  if (isConfirmDisabled.value || !activeSubscription.value || !activePeriodId.value) return;

  const id = activeSubscription.value.id;
  const periodId = activePeriodId.value;

  // Account-less, user chose to only update the schedule.
  if (recordMode.value === 'mark') {
    submitPay({ id, periodId });
    return;
  }

  submitPay({
    id,
    periodId,
    createTransaction: true,
    amount: Number(amount.value),
    time: paidDate.value,
    // Pass the picked account only in the account-less flow; the backend links
    // it to the subscription so future payments reuse it.
    ...(!hasAccount.value && selectedAccountId.value ? { accountId: selectedAccountId.value } : {}),
  });
}

function confirmOverpay() {
  if (!pendingPayPayload.value) return;
  submitPay({ ...pendingPayPayload.value, confirmOverpay: true });
}

defineExpose({ triggerPay, isPending });
</script>

<template>
  <ResponsiveDialog v-model:open="isDialogOpen" dialog-content-class="max-w-md">
    <template #title>{{ $t('dialogs.subscriptionMarkPaid.title') }}</template>
    <template #description>
      <template v-if="!hasAccount">
        {{ $t('dialogs.subscriptionMarkPaid.chooseDescription', { name: activeSubscription?.name }) }}
      </template>
      <template v-else>
        {{ $t('dialogs.subscriptionMarkPaid.description', { name: activeSubscription?.name }) }}
      </template>
    </template>

    <div class="grid gap-4">
      <!-- Choose whether to create a payment, only advance the schedule, or link an existing payment. -->
      <RadioGroup v-model="recordMode" class="grid gap-3">
        <Label
          v-if="!hasAccount"
          :class="
            cn(
              'border-input hover:bg-accent hover:text-accent-foreground flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors',
              recordMode === 'mark' && 'border-primary bg-primary/5',
            )
          "
        >
          <div class="flex items-center gap-2">
            <RadioGroupItem value="mark" />
            <span class="font-medium">{{ $t('dialogs.subscriptionMarkPaid.recordModeMarkTitle') }}</span>
          </div>
          <span class="text-muted-foreground pl-6 text-xs">
            {{ $t('dialogs.subscriptionMarkPaid.recordModeMarkDescription') }}
          </span>
        </Label>
        <Label
          :class="
            cn(
              'border-input hover:bg-accent hover:text-accent-foreground flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors',
              recordMode === 'transaction' && 'border-primary bg-primary/5',
            )
          "
        >
          <div class="flex items-center gap-2">
            <RadioGroupItem value="transaction" />
            <span class="font-medium">
              {{ $t('dialogs.subscriptionMarkPaid.recordModeTransactionTitle') }}
            </span>
          </div>
          <span class="text-muted-foreground pl-6 text-xs">
            {{ $t('dialogs.subscriptionMarkPaid.recordModeTransactionDescription') }}
          </span>
        </Label>
        <Label
          :class="
            cn(
              'border-input hover:bg-accent hover:text-accent-foreground flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors',
              recordMode === 'link' && 'border-primary bg-primary/5',
              !activePeriodDueDate && 'cursor-not-allowed opacity-50',
            )
          "
        >
          <div class="flex items-center gap-2">
            <RadioGroupItem value="link" :disabled="!activePeriodDueDate" />
            <span class="font-medium">{{ $t('dialogs.subscriptionMarkPaid.recordModeLinkTitle') }}</span>
          </div>
          <span class="text-muted-foreground pl-6 text-xs">
            {{ $t('dialogs.subscriptionMarkPaid.recordModeLinkDescription') }}
          </span>
        </Label>
      </RadioGroup>

      <!-- Booking a real transaction: capture account (when not yet linked), amount, date. -->
      <template v-if="isBooking">
        <AccountSelectField
          v-if="!hasAccount"
          :model-value="selectedAccount"
          :accounts="allAccounts"
          :label="$t('dialogs.subscriptionMarkPaid.accountLabel')"
          :placeholder="$t('dialogs.subscriptionMarkPaid.accountPlaceholder')"
          @update:model-value="(account: AccountModel | null) => (selectedAccountId = account?.id ?? null)"
        />

        <InputField
          v-model="amount"
          type="number"
          step="0.01"
          min="0.01"
          only-positive
          :label="$t('dialogs.subscriptionMarkPaid.amountLabel')"
          :placeholder="$t('dialogs.subscriptionMarkPaid.amountPlaceholder')"
        >
          <template v-if="dialogAmountCurrency" #iconTrailing>
            <span>{{ dialogAmountCurrency }}</span>
          </template>
        </InputField>

        <p v-if="isEstimateLoading" class="text-muted-foreground text-xs">
          {{ $t('dialogs.subscriptionMarkPaid.estimateLoading') }}
        </p>
        <p
          v-else-if="estimate?.isCrossCurrency && estimate.expectedAmount != null"
          class="text-muted-foreground text-xs"
        >
          {{
            $t('dialogs.subscriptionMarkPaid.crossCurrencyEstimate', {
              sourceAmount: estimate.expectedAmount,
              sourceCurrency: estimate.subscriptionCurrencyCode,
              accountCurrency: estimate.accountCurrencyCode,
            })
          }}
        </p>

        <DateField
          v-model="paidDate"
          :label="$t('dialogs.subscriptionMarkPaid.dateLabel')"
          :calendar-options="{ maxDate: today }"
        />

        <div v-if="accountLabel" class="bg-muted/40 rounded-md px-3 py-2 text-sm">
          <p class="text-muted-foreground text-xs">{{ $t('dialogs.subscriptionMarkPaid.accountLabel') }}</p>
          <p class="font-medium">{{ accountLabel }}</p>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UiButton variant="outline" :disabled="isPending" @click="isDialogOpen = false">
          {{ $t('common.actions.cancel') }}
        </UiButton>
        <UiButton v-if="recordMode !== 'link'" :disabled="isConfirmDisabled" :loading="isPending" @click="confirmPay">
          {{ confirmLabel }}
        </UiButton>
      </div>
    </template>
  </ResponsiveDialog>

  <PickTransactionDialog
    v-model:open="isLinkTransactionDialogOpen"
    :transaction-type="activeSubscription?.transactionType"
    :transaction-date="activePeriodDueDate ?? undefined"
    @select="handleLinkedTransaction"
  />

  <ResponsiveAlertDialog
    v-model:open="isOverpayConfirmOpen"
    :confirm-label="$t('planned.subscriptions.markPaid.overpayConfirmButton')"
    :confirm-disabled="isPending"
    confirm-variant="destructive"
    @confirm="confirmOverpay"
  >
    <template #title>{{ $t('planned.subscriptions.markPaid.overpayTitle') }}</template>
    <template #description>
      {{ $t('planned.subscriptions.markPaid.overpayDescription', { amount: overpayAmountDisplay }) }}
    </template>
  </ResponsiveAlertDialog>
</template>
