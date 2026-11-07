import { recordId } from '@common/lib/zod/custom-types';
import { deletePortfolioTransfer } from '@services/investments/portfolios/transfers';
import { z } from 'zod';

import { defineTool } from '../define-tool';

export const deletePortfolioTransferTool = defineTool({
  name: 'delete_portfolio_transfer',
  toolset: 'investments',
  access: 'delete',
  description:
    'Permanently delete a portfolio transfer, a direct deposit/withdrawal or a currency exchange, and reverse its effect on the portfolio cash balances. For a transfer made with an account, the linked account transaction is kept as a plain transaction unless deleteLinkedTransaction is true. A contribution with grouped purchases is refused unless deleteLinkedInvestmentTransactions is true, which also deletes those purchases. This action is irreversible — confirm with the user before calling. Obtain transferId from list_portfolio_transfers.',
  input: {
    transferId: recordId().describe('Portfolio transfer ID (from list_portfolio_transfers)'),
    deleteLinkedTransaction: z
      .boolean()
      .optional()
      .describe(
        'For a transfer made with an account: true also deletes the linked account transaction; false (default) keeps it as a plain transfer transaction',
      ),
    deleteLinkedInvestmentTransactions: z
      .boolean()
      .optional()
      .describe(
        'For a grouped contribution: true deletes its purchases together with the transfer; the delete is refused while purchases exist and this is not true. Default false',
      ),
  },
  run: async ({ userId, args }) => {
    await deletePortfolioTransfer({
      userId,
      transferId: args.transferId,
      deleteLinkedTransaction: args.deleteLinkedTransaction ?? false,
      deleteLinkedInvestmentTransactions: args.deleteLinkedInvestmentTransactions ?? false,
    });

    return { deleted: true, id: args.transferId };
  },
});
