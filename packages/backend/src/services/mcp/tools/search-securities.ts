import type { UserModel } from '@bt/shared/types';
import { ASSET_CLASS } from '@bt/shared/types/investments';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchSecurities } from '@services/investments/securities/search.service';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

const inputSchema = {
  query: z.string().describe('Ticker symbol or company name to search for (e.g. "AAPL", "Apple")'),
  portfolioId: z
    .string()
    .uuid()
    .optional()
    .describe('Portfolio ID to annotate results with isInPortfolio flag (from get_portfolios)'),
  assetClass: z
    .nativeEnum(ASSET_CLASS)
    .optional()
    .describe('Filter by a supported asset class, such as stocks or crypto'),
  limit: z.number().optional().describe('Maximum number of results to return (default: 20)'),
};

export function registerSearchSecurities(server: McpServer) {
  server.registerTool(
    'search_securities',
    {
      description:
        'Search for securities (stocks, ETFs, crypto, etc.) by ticker symbol or company name. Results preserve providerSymbol, providerName, priceSourceSymbol, currency and exchange identity. Pass one complete result to create_holding or grouped contribution tools; create_holding returns the persisted securityId for investment transactions. If portfolioId is provided, each result includes isInPortfolio to indicate whether the security is already tracked in that portfolio.',
      inputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'search_securities', clientId: extra.authInfo?.clientId });

      const results = await searchSecurities({
        query: args.query,
        limit: args.limit,
        portfolioId: args.portfolioId,
        user: { id: userId } as UserModel,
        assetClass: args.assetClass,
      });

      return jsonContent({ data: results });
    },
  );
}
