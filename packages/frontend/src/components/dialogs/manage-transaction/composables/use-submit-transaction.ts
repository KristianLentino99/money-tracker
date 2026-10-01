import { createTransaction, editTransaction, linkTransactions } from '@/api';
import { uploadTransactionAttachment } from '@/api/attachments';
import {
  accountToPortfolioTransfer,
  createInvestmentContribution,
  createInvestmentContributionFromTransaction,
  linkTransactionToPortfolio,
} from '@/api/portfolios';
import { linkTransactionsToSubscription } from '@/api/subscriptions';
import { OUT_OF_WALLET_ACCOUNT_MOCK, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { getInvalidationQueryKey } from '@/composable/data-queries/opposite-tx-record';
import { invalidateTransferRelatedQueries } from '@/composable/data-queries/portfolio-transfers';
import { useInvalidateSubscriptionQueries } from '@/composable/data-queries/subscriptions';
import { i18n } from '@/i18n';
import { ApiErrorResponseError, extractApiErrorMessage, isApiErrorWithCode } from '@/js/errors';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { useOnboardingStore } from '@/stores/onboarding';
import { API_ERROR_CODES, type TransactionModel } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

import type { UI_FORM_STRUCT } from '../types';
import {
  applyOptimisticTransactionUpdate,
  buildOptimisticTransaction,
  prepareTxCreationParams,
  prepareTxUpdationParams,
  rollbackOptimisticUpdate,
} from '../utils';

interface SubmitTransactionParams {
  form: UI_FORM_STRUCT;
  isFormCreation: boolean;
  isTransferTx: boolean;
  isCurrenciesDifferent: boolean;
  isOriginalRefundsOverriden: boolean;
  isRecordExternal: boolean;
  transaction?: TransactionModel;
  linkedTransaction?: TransactionModel | null;
  oppositeTransaction?: TransactionModel;
  /** Files picked before the row existed; uploaded right after creation. */
  pendingAttachments?: File[];
}

interface OptimisticUpdateContext {
  previousQueries: Map<string, unknown>;
}

export const buildInvestmentContributionPayload = ({ form }: { form: UI_FORM_STRUCT }) => {
  if (!form.investmentContribution) return null;

  return {
    purchases: form.investmentContribution.purchases.map((purchase) => ({
      ...(purchase.securityId ? { securityId: purchase.securityId } : { searchResult: purchase.searchResult! }),
      quantity: purchase.quantity,
      price: purchase.price,
      fees: purchase.fees || '0',
      date: purchase.date.toISOString(),
      ...(purchase.name?.trim() ? { name: purchase.name.trim() } : {}),
      ...(purchase.settlementCurrency
        ? {
            settlementCurrencyCode: purchase.settlementCurrency.code,
            settlementAmount: purchase.settlementAmount,
            ...(purchase.settlementCurrency.code !==
            (purchase.searchResult?.currencyCode ?? purchase.securityLabel?.currencyCode)
              ? { settlementFees: purchase.settlementFees || '0' }
              : {}),
          }
        : {}),
    })),
  };
};

export const isInvestmentContributionFormValid = ({ form }: { form: UI_FORM_STRUCT }) => {
  const contribution = form.investmentContribution;
  if (
    !contribution ||
    !contribution.portfolio ||
    !form.account ||
    form.amount == null ||
    !form.category ||
    contribution.purchases.length === 0
  ) {
    return false;
  }
  if (form.splits?.length) return false;

  return contribution.purchases.every((purchase) => {
    const quantity = Number(purchase.quantity);
    const price = Number(purchase.price);
    const fees = Number(purchase.fees || 0);
    const settlementAmount = Number(purchase.settlementAmount);
    const settlementFees = Number(purchase.settlementFees || 0);

    return (
      (!!purchase.searchResult || !!purchase.securityId) &&
      Number.isFinite(quantity) &&
      quantity > 0 &&
      Number.isFinite(price) &&
      price >= 0 &&
      Number.isFinite(fees) &&
      fees >= 0 &&
      Number.isFinite(purchase.date.getTime()) &&
      (!purchase.settlementCurrency ||
        (Number.isFinite(settlementAmount) &&
          settlementAmount >= 0 &&
          Number.isFinite(settlementFees) &&
          settlementFees >= 0))
    );
  });
};

export const uploadPendingTransactionAttachments = async ({
  transactionIds,
  files,
  onError,
}: {
  transactionIds: string[];
  files: File[];
  onError: (error: unknown) => void;
}): Promise<boolean> => {
  let attachmentsFailed = false;
  for (const file of files) {
    for (const transactionId of transactionIds) {
      try {
        await uploadTransactionAttachment({ transactionId, file });
      } catch (error) {
        attachmentsFailed = true;
        // The API client announces expired sessions and plan-required responses.
        if (
          !isApiErrorWithCode(error, API_ERROR_CODES.unauthorized) &&
          !isApiErrorWithCode(error, API_ERROR_CODES.planRequired)
        ) {
          onError(error);
        }
      }
    }
  }
  return attachmentsFailed;
};

export function useSubmitTransaction({
  onSuccess,
}: {
  onSuccess: (result: { created?: TransactionModel; attachmentsFailed?: boolean }) => void;
}) {
  const queryClient = useQueryClient();
  const { addErrorNotification } = useNotificationCenter();
  const invalidateSubscriptionQueries = useInvalidateSubscriptionQueries();

  const announceAttachmentError = (error: unknown) => {
    addErrorNotification(
      extractApiErrorMessage(error) || i18n.global.t('dialogs.manageTransaction.form.attachments.errors.upload'),
    );
  };

  return useMutation({
    mutationFn: async (params: SubmitTransactionParams) => {
      const {
        form,
        isFormCreation,
        isTransferTx,
        isCurrenciesDifferent,
        isOriginalRefundsOverriden,
        isRecordExternal,
        transaction,
        linkedTransaction,
        pendingAttachments = [],
      } = params;

      if (form.investmentContribution) {
        const payload = buildInvestmentContributionPayload({ form });
        if (!payload || !form.investmentContribution.portfolio || !form.category) {
          throw new Error(i18n.global.t('dialogs.manageTransaction.investmentContribution.validationError'));
        }

        if (isFormCreation) {
          const contribution = await createInvestmentContribution({
            portfolioId: form.investmentContribution.portfolio.id,
            accountId: form.account!.id,
            amount: String(form.amount!),
            date: form.time.toISOString().split('T')[0]!,
            categoryId: form.category.id,
            description: form.note,
            ...payload,
          });
          const attachmentsFailed = await uploadPendingTransactionAttachments({
            transactionIds: contribution.transactionId ? [contribution.transactionId] : [],
            files: pendingAttachments,
            onError: announceAttachmentError,
          });
          return { transactionId: contribution.transactionId, attachmentsFailed };
        }

        return createInvestmentContributionFromTransaction({
          transactionId: transaction!.id,
          portfolioId: form.investmentContribution.portfolio.id,
          categoryId: form.category.id,
          ...payload,
        });
      }

      if (isFormCreation) {
        if (isTransferTx && form.toPortfolio) {
          await accountToPortfolioTransfer({
            portfolioId: form.toPortfolio.id,
            accountId: form.account!.id,
            amount: String(form.amount!),
            date: form.time.toISOString().split('T')[0]!,
            description: form.note,
          });
          return {};
        }

        const createdResult = await createTransaction(
          prepareTxCreationParams({
            form,
            isTransferTx,
            isCurrenciesDifferent,
          }),
        );
        const created = createdResult.filter((tx): tx is TransactionModel => tx !== undefined);
        // The row is already saved, so a failed upload is reported without failing the submit.
        // Each transfer leg gets its own copy, so deleting it from one leg keeps the other.
        const attachmentsFailed = await uploadPendingTransactionAttachments({
          transactionIds: created.map((tx) => tx.id),
          files: pendingAttachments,
          onError: announceAttachmentError,
        });
        // A transfer's two legs give no single row a caller could act on.
        return { created: isTransferTx ? undefined : created[0], attachmentsFailed };
      } else if (linkedTransaction) {
        await linkTransactions({
          ids: [[transaction!.id, linkedTransaction.id]],
        });
        return {};
      } else if (isTransferTx && form.toPortfolio && transaction) {
        await linkTransactionToPortfolio({
          transactionId: transaction.id,
          portfolioId: form.toPortfolio.id,
          affectsCash: !form.portfolioCashAlreadyReflected,
        });
        return {};
      } else {
        await editTransaction(
          prepareTxUpdationParams({
            form,
            transaction: transaction!,
            linkedTransaction,
            isTransferTx,
            isRecordExternal,
            isCurrenciesDifferent,
            isOriginalRefundsOverriden,
          }),
        );
        return {};
      }
    },
    onMutate: async (params): Promise<OptimisticUpdateContext | undefined> => {
      const { form, isFormCreation, transaction, isRecordExternal, linkedTransaction, isTransferTx } = params;

      // Only apply optimistic updates for edits (not creation, linking, or portfolio conversion)
      if (
        isFormCreation ||
        linkedTransaction ||
        !transaction ||
        form.investmentContribution ||
        (isTransferTx && form.toPortfolio)
      ) {
        return undefined;
      }

      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });

      // Build the optimistically updated transaction
      const updatedTransaction = buildOptimisticTransaction({
        form,
        transaction,
        isRecordExternal,
      });

      // Apply optimistic update to all relevant caches
      const context = applyOptimisticTransactionUpdate({
        queryClient,
        transactionId: transaction.id,
        updatedTransaction,
      });

      return context;
    },
    onSuccess: async (data, params) => {
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });

      if (params.form.recurringPaymentId) {
        const transactionId = params.isFormCreation
          ? Array.isArray(data)
            ? data[0]?.id
            : data && 'created' in data
              ? data.created?.id
              : data && 'transactionId' in data
                ? data.transactionId
                : undefined
          : params.transaction?.id;

        if (transactionId) {
          try {
            await linkTransactionsToSubscription({
              id: params.form.recurringPaymentId,
              transactionIds: [transactionId],
            });
            queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
            invalidateSubscriptionQueries();
          } catch (error) {
            if (error instanceof ApiErrorResponseError) {
              addErrorNotification(error.data.message ?? i18n.global.t('common.transactions.submit.unexpectedError'));
            } else {
              addErrorNotification(i18n.global.t('common.transactions.submit.unexpectedError'));
            }
          }
        }
      }

      if ((params.isTransferTx && params.form.toPortfolio) || params.form.investmentContribution) {
        invalidateTransferRelatedQueries(queryClient);
      }

      // Loan caches need no extra handling: their keys are prefixed with
      // transactionChange, so the blanket invalidation above already covers
      // both the new destination and any previous loan the payment moved off.

      if (params.transaction?.id) {
        queryClient.invalidateQueries({
          queryKey: getInvalidationQueryKey(params.transaction.id),
        });
      }
      if (params.oppositeTransaction?.id) {
        queryClient.invalidateQueries({
          queryKey: getInvalidationQueryKey(params.oppositeTransaction.id),
        });
      }
      if (params.linkedTransaction?.id) {
        queryClient.invalidateQueries({
          queryKey: getInvalidationQueryKey(params.linkedTransaction.id),
        });
      }

      // Mark onboarding tasks as complete
      const onboardingStore = useOnboardingStore();

      if (params.isFormCreation) {
        const transactionType = params.isTransferTx
          ? 'transfer'
          : (params.form.amount ?? 0) >= 0
            ? 'income'
            : 'expense';
        trackAnalyticsEvent({
          event: 'transaction_created',
          properties: { transaction_type: transactionType },
        });

        onboardingStore.completeTask('add-transaction');

        // Mark transfer task if this was a transfer
        if (params.isTransferTx) {
          onboardingStore.completeTask('create-transfer');
        }
      }

      // Mark link-transactions task when linking existing transactions
      if (params.linkedTransaction) {
        onboardingStore.completeTask('link-transactions');
      }

      // Mark link-refund task when refund relationships are set
      if (params.form.refundsTx || (params.form.refundedByTxs && params.form.refundedByTxs.length > 0)) {
        onboardingStore.completeTask('link-refund');
      }

      // Mark split-transaction task when transaction has splits
      if (params.form.splits && params.form.splits.length > 0) {
        onboardingStore.completeTask('split-transaction');
      }

      // Mark transfer-out-of-wallet task when source or destination is "out of wallet"
      if (
        params.form.account?.id === OUT_OF_WALLET_ACCOUNT_MOCK.id ||
        params.form.toAccount?.id === OUT_OF_WALLET_ACCOUNT_MOCK.id
      ) {
        onboardingStore.completeTask('mark-transfer-out');
      }

      onSuccess({
        ...(data && 'created' in data ? { created: data.created } : {}),
        ...(data && 'attachmentsFailed' in data ? { attachmentsFailed: data.attachmentsFailed } : {}),
      });
    },
    onError: (error, _, context) => {
      // Rollback optimistic update on error
      if (context) {
        rollbackOptimisticUpdate({ queryClient, context });
      }

      if (error instanceof ApiErrorResponseError) {
        addErrorNotification(error.data.message ?? error.message);
      } else {
        // eslint-disable-next-line no-console
        console.error(error);
        addErrorNotification(i18n.global.t('common.transactions.submit.unexpectedError'));
      }
    },
  });
}
