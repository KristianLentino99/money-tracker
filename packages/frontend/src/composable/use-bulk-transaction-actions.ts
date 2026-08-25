import { linkTransactionsToSubscription } from '@/api/subscriptions';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import type { BulkEditFormValues } from '@/components/transactions-list/bulk-edit-dialog.vue';
import { useInvalidateSubscriptionQueries } from '@/composable/data-queries/subscriptions';
import { i18n } from '@/i18n';
import { ApiErrorResponseError } from '@/js/errors';
import { useAccountsStore } from '@/stores';
import { ACCOUNT_TYPES, TRANSACTION_TYPES, type AccountModel, type TransactionModel } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

import { useBulkSelectability, useTransactionSelection } from './transaction-selection';
import { useBulkDeleteTransactions } from './use-bulk-delete-transactions';
import { useBulkUpdateCategory } from './use-bulk-update-category';

/**
 * Bank-connected (external) transactions can't be deleted — the backend rejects
 * them. The account's own type is authoritative; tx.accountType is a fallback
 * for accounts that haven't loaded yet.
 */
export function isExternalTransaction({ tx, account }: { tx: TransactionModel; account: AccountModel | undefined }) {
  if (account) return account.type !== ACCOUNT_TYPES.system;
  return tx.accountType !== ACCOUNT_TYPES.system;
}

/**
 * The full bulk-operations surface shared by the transactions list and table
 * views: row selection, eligibility (shared-account / external lockouts), the
 * bulk update & delete mutations, and the open-state of every bulk dialog.
 * Pair it with `BulkActionDialogs`, which hosts the dialogs this state drives —
 * the views only keep their own toolbars (presentation genuinely differs).
 */
export function useBulkTransactionActions({
  getTransactions,
  getScopeKey,
}: {
  getTransactions: () => TransactionModel[];
  getScopeKey?: () => string | undefined;
}) {
  const queryClient = useQueryClient();
  const { accountsRecord } = storeToRefs(useAccountsStore());
  const { isBulkSelectable, getUnselectableReason } = useBulkSelectability();
  const { addErrorNotification, addSuccessNotification } = useNotificationCenter();
  const invalidateSubscriptionQueries = useInvalidateSubscriptionQueries();

  const selection = useTransactionSelection({
    getTransactions,
    getScopeKey,
    isExtraSelectable: isBulkSelectable,
  });

  const isExternalTx = (tx: TransactionModel) =>
    isExternalTransaction({ tx, account: accountsRecord.value[tx.accountId] });

  const hasExternalSelected = computed(() => {
    const selectedIds = new Set(selection.getSelectedTransactionIds());
    if (selectedIds.size === 0) return false;
    return getTransactions().some((tx) => selectedIds.has(tx.id) && isExternalTx(tx));
  });

  // Checkbox tri-state for "select all" headers (the list toolbar only needs
  // the boolean `isAllSelected`).
  const selectAllState = computed<boolean | 'indeterminate'>(() => {
    if (selection.selectedCount.value === 0) return false;
    if (selection.isAllSelected.value) return true;
    return 'indeterminate';
  });

  const handleSelectAllToggle = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      selection.selectAll();
    } else {
      selection.clearSelection();
    }
  };

  const isBulkEditDialogOpen = ref(false);
  const isCreateGroupDialogOpen = ref(false);
  const isAddToGroupDialogOpen = ref(false);
  const isBulkDeleteDialogOpen = ref(false);
  const isLinkRecurringPaymentDialogOpen = ref(false);

  const selectedTransactions = computed(() => {
    const selectedIds = new Set(selection.getSelectedTransactionIds());
    return getTransactions().filter((tx) => selectedIds.has(tx.id));
  });

  const selectedTransactionTypes = computed(
    () => new Set(selectedTransactions.value.map((transaction) => transaction.transactionType)),
  );
  const selectedTransactionType = computed<TRANSACTION_TYPES | null>(() => {
    if (selectedTransactionTypes.value.size !== 1) return null;
    return [...selectedTransactionTypes.value][0] ?? null;
  });
  const hasMixedTransactionTypes = computed(() => selectedTransactionTypes.value.size > 1);

  const bulkUpdateMutation = useBulkUpdateCategory({
    onSuccess: () => {
      selection.clearSelection();
      isBulkEditDialogOpen.value = false;
    },
  });

  const bulkDeleteMutation = useBulkDeleteTransactions({
    onSuccess: () => {
      selection.clearSelection();
      isBulkDeleteDialogOpen.value = false;
    },
  });

  const linkRecurringPaymentMutation = useMutation({
    mutationFn: ({ subscriptionId, transactionIds }: { subscriptionId: string; transactionIds: string[] }) =>
      linkTransactionsToSubscription({ id: subscriptionId, transactionIds }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
      invalidateSubscriptionQueries();
      selection.clearSelection();
      isLinkRecurringPaymentDialogOpen.value = false;
      addSuccessNotification(
        i18n.global.t('transactions.bulkLinkSubscription.successMessage', { count: result.linked }),
      );
    },
    onError: (error) => {
      if (error instanceof ApiErrorResponseError) {
        addErrorNotification(error.data.message ?? i18n.global.t('transactions.bulkLinkSubscription.errorMessage'));
      } else {
        addErrorNotification(i18n.global.t('transactions.bulkLinkSubscription.errorMessage'));
      }
    },
  });

  const isBulkLoading = computed(
    () =>
      bulkUpdateMutation.isPending.value ||
      bulkDeleteMutation.isPending.value ||
      linkRecurringPaymentMutation.isPending.value,
  );

  const handleBulkApply = (values: BulkEditFormValues) => {
    bulkUpdateMutation.mutate({
      transactionIds: selection.getSelectedTransactionIds(),
      ...(values.categoryId !== undefined && { categoryId: values.categoryId }),
      ...(values.tagIds !== undefined && { tagIds: values.tagIds, tagMode: values.tagMode }),
      ...(values.note !== undefined && { note: values.note }),
      ...(values.payeeId !== undefined && { payeeId: values.payeeId }),
    });
  };

  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate({ transactionIds: selection.getSelectedTransactionIds() });
  };

  const handleLinkToRecurringPayment = ({ subscriptionId }: { subscriptionId: string }) => {
    if (hasMixedTransactionTypes.value) return;
    linkRecurringPaymentMutation.mutate({
      subscriptionId,
      transactionIds: selection.getSelectedTransactionIds(),
    });
  };

  return {
    ...selection,
    getUnselectableReason,
    hasExternalSelected,
    selectAllState,
    handleSelectAllToggle,
    isBulkEditDialogOpen,
    isCreateGroupDialogOpen,
    isAddToGroupDialogOpen,
    isBulkDeleteDialogOpen,
    isLinkRecurringPaymentDialogOpen,
    selectedTransactionType,
    hasMixedTransactionTypes,
    bulkUpdateMutation,
    bulkDeleteMutation,
    linkRecurringPaymentMutation,
    isBulkLoading,
    handleBulkApply,
    handleBulkDelete,
    handleLinkToRecurringPayment,
  };
}

export type BulkTransactionActions = ReturnType<typeof useBulkTransactionActions>;
