import { USER_ROLES } from '@bt/shared/types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isBaseCurrencyChangeLocked } from '@services/currencies/base-currency-lock';
import { deletePlanCategoryTarget } from '@services/plans/plans.service';

import { registerDeletePlanCategoryTarget } from './plan-tools';

jest.mock('@services/currencies/base-currency-lock', () => ({ isBaseCurrencyChangeLocked: jest.fn() }));
jest.mock('@services/plans/plans.service', () => ({ deletePlanCategoryTarget: jest.fn() }));
jest.mock('@js/utils/posthog', () => ({ trackMcpToolUsed: jest.fn() }));

type Handler = (args: Record<string, unknown>, extra: unknown) => Promise<unknown>;
let handler: Handler;
const args = {
  planId: '00000000-0000-4000-8000-000000000001',
  categoryId: '00000000-0000-4000-8000-000000000002',
};
const authFor = ({ scopes }: { scopes: string[] }) => ({
  authInfo: { scopes, extra: { userId: 42, role: USER_ROLES.common, readOnly: false } },
});

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(isBaseCurrencyChangeLocked).mockResolvedValue(false);
  jest.mocked(deletePlanCategoryTarget).mockResolvedValue(null);
  registerDeletePlanCategoryTarget({
    registerTool: (_name: string, _config: unknown, callback: Handler) => {
      handler = callback;
    },
  } as unknown as McpServer);
});

describe('MCP plan target deletion scopes', () => {
  it('rejects a write-only token before deleting the target', async () => {
    await expect(handler(args, authFor({ scopes: ['finance:write'] }))).rejects.toThrow(
      'Missing required scope: finance:delete',
    );
    expect(deletePlanCategoryTarget).not.toHaveBeenCalled();
  });

  it('allows a token granted finance:delete', async () => {
    await handler(args, authFor({ scopes: ['finance:delete'] }));

    expect(deletePlanCategoryTarget).toHaveBeenCalledWith({ userId: 42, ...args });
  });
});
