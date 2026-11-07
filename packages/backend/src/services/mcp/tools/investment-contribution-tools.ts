import { currencyCode, dateString, numericString, recordId } from '@common/lib/zod/custom-types';
import {
  investmentContributionPurchaseSchema,
  securitySearchResultSchema,
} from '@controllers/investments/portfolios/investment-contribution-schemas';
import {
  createInvestmentContribution,
  createInvestmentContributionFromTransaction,
  updateInvestmentContribution,
} from '@services/investments/portfolios/transfers';
import { z } from 'zod';

import { defineTool } from '../define-tool';
import { slimPortfolioTransferForMcp } from '../serializers';

// MCP publishes the input object; the transform applies REST identity and settlement validation plus defaults.
const purchaseInputSchema = z
  .object({
    securityId: recordId().optional(),
    searchResult: securitySearchResultSchema.optional(),
    quantity: numericString(),
    price: numericString({ allowZero: true }),
    fees: numericString({ allowZero: true }).optional(),
    date: z.union([dateString(), z.string().datetime({ offset: true })]),
    name: z.string().max(2000).optional(),
    settlementCurrencyCode: currencyCode().optional(),
    settlementAmount: numericString({ allowZero: true }).optional(),
    settlementFees: numericString({ allowZero: true }).optional(),
    settlementRate: numericString().optional(),
  })
  .transform((value) => investmentContributionPurchaseSchema.parse(value));

const purchases = z
  .array(purchaseInputSchema)
  .min(1)
  .describe(
    'Purchases grouped under the contribution. Each row needs exactly one securityId or full searchResult from search_securities; quantity, price, fees and settlement amounts are decimal strings.',
  );
const createSchema = {
  portfolioId: recordId().describe('Destination portfolio ID'),
  accountId: recordId().describe('Source account ID'),
  amount: numericString().describe('Account expense and contribution amount, as a positive decimal string'),
  date: dateString().describe('Cash movement date (YYYY-MM-DD)'),
  categoryId: recordId().describe('Expense category ID for the bank/account transaction'),
  description: z.string().max(2000).nullable().optional(),
  purchases,
};
const fromTransactionSchema = {
  transactionId: recordId().describe('Existing expense transaction ID; the movement is linked, never duplicated'),
  portfolioId: recordId().describe('Destination portfolio ID'),
  categoryId: recordId().describe('Expense category ID assigned to the source transaction'),
  purchases,
};
const updateSchema = {
  portfolioId: recordId().describe('Destination portfolio ID'),
  transferId: recordId().describe('Contribution transfer ID from list_portfolio_transfers'),
  purchases: purchases.describe('Complete replacement purchase list; the underlying account movement is preserved'),
};

export const createInvestmentContributionTool = defineTool({
  name: 'create_investment_contribution',
  toolset: 'investments',
  access: 'write',
  description:
    'Create one grouped investment contribution: source-account expense, portfolio cash movement, holdings and purchases together. Reuse full search_securities results to preserve provider identity. Amounts are decimal strings.',
  input: createSchema,
  run: async ({ userId, args }) => slimPortfolioTransferForMcp(await createInvestmentContribution({ userId, ...args })),
});

export const createInvestmentContributionFromTransactionTool = defineTool({
  name: 'create_investment_contribution_from_transaction',
  toolset: 'investments',
  access: 'write',
  description:
    'Attach grouped investment purchases to an existing expense transaction without duplicating the account movement. The transaction must not already be a transfer. Creates missing securities and holdings from full search results.',
  input: fromTransactionSchema,
  run: async ({ userId, args }) =>
    slimPortfolioTransferForMcp(await createInvestmentContributionFromTransaction({ userId, ...args })),
});

export const updateInvestmentContributionTool = defineTool({
  name: 'update_investment_contribution',
  toolset: 'investments',
  access: 'write',
  description:
    'Replace the purchases in a grouped contribution while preserving its original account cash movement. Submit the complete desired purchase list; existing purchases are reversed and recreated with recalculation.',
  input: updateSchema,
  run: async ({ userId, args }) => slimPortfolioTransferForMcp(await updateInvestmentContribution({ userId, ...args })),
});
