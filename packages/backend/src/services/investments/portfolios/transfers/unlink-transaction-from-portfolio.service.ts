import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Currencies from '@models/currencies.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import * as Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';

import { reverseTransferBalanceChanges } from './transfer-validations';

interface UnlinkTransactionFromPortfolioParams {
  userId: number;
  transactionId: string;
}

const unlinkTransactionFromPortfolioImpl = async ({ userId, transactionId }: UnlinkTransactionFromPortfolioParams) => {
  const transfer = await PortfolioTransfers.findOne({
    where: { transactionId, userId },
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

  if (transfer.investmentTransactions?.length) {
    throw new ValidationError({
      message: t({ key: 'investments.contributionDeletePurchasesConfirmationRequired' }),
    });
  }

  await reverseTransferBalanceChanges({ transfer, userId });

  const originalState = (transfer.metaData as Record<string, any> | null)?.originalTransactionState;

  await Transactions.updateTransactionById({
    id: transactionId,
    userId,
    transferNature: originalState?.transferNature ?? TRANSACTION_TRANSFER_NATURE.not_transfer,
  });

  await transfer.destroy();

  return { success: true };
};

export const unlinkTransactionFromPortfolio = withTransaction(unlinkTransactionFromPortfolioImpl);
