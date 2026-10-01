import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { currencyCode } from '@common/lib/zod/custom-types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createPortfolio } from '@services/investments/portfolios/create.service';
import { z } from 'zod';

import { assertMcpMutationAllowed, getUserId, jsonContent } from './helpers';

const inputSchema = {
  name: z.string().describe('Portfolio name'),
  portfolioType: z
    .enum([PORTFOLIO_TYPE.investment, PORTFOLIO_TYPE.retirement, PORTFOLIO_TYPE.savings, PORTFOLIO_TYPE.other])
    .describe('Type of portfolio: investment, retirement, savings, or other'),
  description: z.string().optional().describe('Optional description of the portfolio'),
  displayCurrencyCode: currencyCode()
    .nullable()
    .optional()
    .describe('Connected display/valuation currency; null follows the user base currency for ordinary portfolios'),
  isManualTracking: z
    .boolean()
    .optional()
    .describe(
      'Track manual cash flows and end-of-day valuations; requires displayCurrencyCode and cannot change after portfolio history exists',
    ),
  isEnabled: z.boolean().optional().describe('Whether the portfolio is active (default: true)'),
};

export function registerCreatePortfolio(server: McpServer) {
  server.registerTool(
    'create_portfolio',
    {
      description:
        'Create a new investment portfolio for the user. Use when the user wants to track a new brokerage account, retirement fund, or savings vehicle. Returns the created portfolio with its id, which can then be used with create_investment_transaction and get_portfolio_holdings.',
      inputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'create_portfolio', clientId: extra.authInfo?.clientId });

      const portfolio = await createPortfolio({
        userId,
        name: args.name,
        portfolioType: args.portfolioType as PORTFOLIO_TYPE,
        description: args.description ?? null,
        isEnabled: args.isEnabled,
        displayCurrencyCode: args.displayCurrencyCode,
        isManualTracking: args.isManualTracking,
      });

      return jsonContent({ data: portfolio });
    },
  );
}
