import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Currencies from '@models/currencies.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import * as Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { deleteInvestmentTransaction } from '@services/investments/transactions/delete.service';

import { reverseTransferBalanceChanges } from './transfer-validations';

interface DeletePortfolioTransferParams {
  userId: number;
  transferId: string;
  deleteLinkedTransaction?: boolean;
  deleteLinkedInvestmentTransactions?: boolean;
}

const deletePortfolioTransferImpl = async ({
  userId,
  transferId,
  deleteLinkedTransaction = false,
  deleteLinkedInvestmentTransactions = false,
}: DeletePortfolioTransferParams) => {
  const transfer = await PortfolioTransfers.findOne({
    where: { id: transferId, userId },
    include: [
      { model: Portfolios, as: 'fromPortfolio' },
      { model: Portfolios, as: 'toPortfolio' },
      { model: Currencies, as: 'currency' },
      { model: InvestmentTransaction, as: 'investmentTransactions' },
    ],
  });

  if (!transfer) {
    return { success: true };
  }

  const linkedInvestmentTransactions = transfer.investmentTransactions ?? [];
  if (linkedInvestmentTransactions.length > 0 && !deleteLinkedInvestmentTransactions) {
    throw new ValidationError({
      message: t({ key: 'investments.contributionDeletePurchasesConfirmationRequired' }),
    });
  }

  for (const investmentTransaction of linkedInvestmentTransactions) {
    await deleteInvestmentTransaction({ userId, transactionId: investmentTransaction.id });
  }

  await reverseTransferBalanceChanges({ transfer, userId });

  // Handle linked account transaction (from account-to-portfolio or portfolio-to-account transfers)
  if (transfer.transactionId) {
    if (deleteLinkedTransaction) {
      await Transactions.deleteTransactionById({ id: transfer.transactionId, userId });
    } else {
      const originalState = (transfer.metaData as Record<string, any> | null)?.originalTransactionState;

      await Transactions.updateTransactionById({
        id: transfer.transactionId,
        userId,
        transferNature: originalState?.transferNature ?? TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        transferId: originalState?.transferId ?? null,
      });
    }
  }

  await transfer.destroy();

  return { success: true };
};

export const deletePortfolioTransfer = withTransaction(deletePortfolioTransferImpl);
