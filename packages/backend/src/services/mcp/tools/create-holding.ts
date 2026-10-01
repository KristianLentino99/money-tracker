import { SUPPORTED_ASSET_CLASSES } from '@bt/shared/types/investments';
import { recordId } from '@common/lib/zod/custom-types';
import { securitySearchResultSchema } from '@controllers/investments/portfolios/investment-contribution-schemas';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHolding } from '@services/investments/holdings/create-holding.service';
import { addSecurityFromSearch } from '@services/investments/securities/add-from-search.service';
import { z } from 'zod';

import { assertMcpMutationAllowed, getUserId, jsonContent } from './helpers';

const inputSchema = {
  portfolioId: recordId().describe('Portfolio ID from get_portfolios'),
  securityId: recordId()
    .optional()
    .describe('Existing security ID; provide exactly one of securityId and searchResult'),
  searchResult: securitySearchResultSchema
    .optional()
    .describe(
      'Full result returned by search_securities, including providerName, providerSymbol, priceSourceSymbol and exchange/currency identity',
    ),
};

const identitySchema = z
  .object(inputSchema)
  .refine(
    (args) => Boolean(args.securityId) !== Boolean(args.searchResult),
    'Provide exactly one of securityId and searchResult.',
  )
  .refine(
    (args) => !args.searchResult || SUPPORTED_ASSET_CLASSES.includes(args.searchResult.assetClass),
    'The selected asset class is not supported.',
  );

export function registerCreateHolding(server: McpServer) {
  server.registerTool(
    'create_holding',
    {
      description:
        'Add a security as a zero-quantity holding in a portfolio before recording trades. Supply either an existing securityId or the full search_securities result to create/find the correct provider listing. Historical prices sync in the background.',
      inputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'create_holding', clientId: extra.authInfo?.clientId });
      const identity = identitySchema.parse(args);
      let securityId = identity.securityId;
      if (identity.searchResult) {
        const { security } = await addSecurityFromSearch({ searchResult: identity.searchResult });
        securityId = security.id;
      }
      return jsonContent({
        data: await createHolding({ userId, portfolioId: args.portfolioId, securityId: securityId! }),
      });
    },
  );
}
