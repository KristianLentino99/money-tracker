import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { isBaseCurrencyChangeLocked } from '@services/currencies/base-currency-lock';
import { createTransaction } from '@services/transactions/create-transaction';
import { updateTransaction } from '@services/transactions/update-transaction';
import { captureTools, makeExtra } from '@tests/helpers/mcp-tools';

import { createTransactionTool } from './create-transaction';
import { updateTransactionTool } from './update-transaction';

jest.mock('@services/currencies/base-currency-lock', () => ({ isBaseCurrencyChangeLocked: jest.fn() }));
jest.mock('@services/transactions/create-transaction', () => ({ createTransaction: jest.fn() }));
jest.mock('@services/transactions/update-transaction', () => ({ updateTransaction: jest.fn() }));
jest.mock('@js/utils/posthog', () => ({
  ...jest.requireActual<object>('@js/utils/posthog'),
  trackMcpToolUsed: jest.fn(),
}));

const ID = '00000000-0000-4000-8000-000000000001';
const WRITE = makeExtra({ scopes: ['finance:read', 'finance:write'] });
const tools = captureTools({ register: [createTransactionTool, updateTransactionTool] });
const handlerOf = ({ name }: { name: string }) => tools.find((tool) => tool.name === name)!.handler;

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(isBaseCurrencyChangeLocked).mockResolvedValue(true);
});

describe('MCP transaction mutation lock', () => {
  it.each([
    {
      name: 'create_transaction',
      args: { accountId: ID, amount: 1, transactionType: 'expense', transferNature: 'not_transfer' },
    },
    { name: 'update_transaction', args: { id: ID } },
  ])('rejects $name before touching the ledger during currency recalculation', async ({ name, args }) => {
    await expect(handlerOf({ name })(args, WRITE)).rejects.toThrow(/baseCurrencyChangeInProgress/);

    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateTransaction).not.toHaveBeenCalled();
  });
});
