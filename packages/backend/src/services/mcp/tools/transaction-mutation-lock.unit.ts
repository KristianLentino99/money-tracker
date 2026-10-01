import { USER_ROLES } from '@bt/shared/types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isBaseCurrencyChangeLocked } from '@services/currencies/base-currency-lock';
import { createTransaction } from '@services/transactions/create-transaction';
import { updateTransaction } from '@services/transactions/update-transaction';

import { registerCreateTransaction } from './create-transaction';
import { registerUpdateTransaction } from './update-transaction';

jest.mock('@services/currencies/base-currency-lock', () => ({ isBaseCurrencyChangeLocked: jest.fn() }));
jest.mock('@services/transactions/create-transaction', () => ({ createTransaction: jest.fn() }));
jest.mock('@services/transactions/update-transaction', () => ({ updateTransaction: jest.fn() }));
jest.mock('@js/utils/posthog', () => ({ trackMcpToolUsed: jest.fn() }));
jest.mock('@root/serializers/transactions.serializer', () => ({ serializeTransactionTuple: jest.fn(() => []) }));
jest.mock('@root/serializers', () => ({
  deserializeCreateTransaction: jest.fn(() => ({})),
  deserializeUpdateTransaction: jest.fn(() => ({})),
  serializeTransactionTuple: jest.fn(() => []),
}));

type Handler = (args: Record<string, unknown>, extra: unknown) => Promise<unknown>;
const handlers = new Map<string, Handler>();
const server = {
  registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
} as unknown as McpServer;
const extra = {
  authInfo: { scopes: ['finance:write'], extra: { userId: 42, role: USER_ROLES.common, readOnly: false } },
};

beforeEach(() => {
  jest.resetAllMocks();
  handlers.clear();
  jest.mocked(isBaseCurrencyChangeLocked).mockResolvedValue(true);
  jest.mocked(createTransaction).mockResolvedValue([] as never);
  jest.mocked(updateTransaction).mockResolvedValue([] as never);
  registerCreateTransaction(server);
  registerUpdateTransaction(server);
});

describe('MCP transaction mutation lock', () => {
  it.each(['create_transaction', 'update_transaction'])(
    'rejects %s before touching the ledger during currency recalculation',
    async (tool) => {
      await expect(handlers.get(tool)!({ id: '00000000-0000-4000-8000-000000000001' }, extra)).rejects.toThrow(
        'Base currency recalculation is in progress',
      );
      expect(createTransaction).not.toHaveBeenCalled();
      expect(updateTransaction).not.toHaveBeenCalled();
    },
  );
});
