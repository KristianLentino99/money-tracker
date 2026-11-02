import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTransactions } from '@services/transactions/get-transactions';
import { z } from 'zod';

import { registerSearchTransactions } from './search-transactions';

jest.mock('@services/transactions/get-transactions', () => ({ getTransactions: jest.fn() }));
jest.mock('@js/utils/posthog', () => ({ trackMcpToolUsed: jest.fn() }));
jest.mock('@root/serializers/transactions.serializer', () => ({ serializeTransactions: (rows: unknown) => rows }));
jest.mock('@services/mcp/serializers', () => ({ slimTransactionsForMcp: (rows: unknown) => rows }));
jest.mock('./helpers', () => ({
  getUserId: () => 42,
  jsonContent: ({ data }: { data: unknown }) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] }),
}));

type SearchResult = {
  content: Array<{
    text: string;
  }>;
};
type Handler = (args: Record<string, unknown>, extra: object) => Promise<SearchResult>;

let handler: Handler;
let schema: z.ZodObject<z.ZodRawShape>;

const searchTransactions = async ({ args = {} }: { args?: Record<string, unknown> } = {}) => {
  const result = await handler(schema.parse(args), {});
  return JSON.parse(result.content[0]!.text);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date('2026-11-02T12:00:00.000Z'));
  jest.mocked(getTransactions).mockResolvedValue([]);
  registerSearchTransactions({
    registerTool: (_name: string, config: { inputSchema: z.ZodRawShape }, toolHandler: Handler) => {
      schema = z.object(config.inputSchema);
      handler = toolHandler;
    },
  } as unknown as McpServer);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MCP transaction search history and pagination', () => {
  it('preserves the default recent window across all accessible accounts', async () => {
    await searchTransactions();

    expect(getTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        accountIds: undefined,
        collapsePayments: false,
        startDate: '2026-10-03T12:00:00.000Z',
        endDate: '2026-11-02T12:00:00.000Z',
      }),
    );
  });

  it('can explicitly search all history without a hidden date window', async () => {
    await searchTransactions({ args: { allTime: true } });

    expect(getTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: undefined, endDate: undefined, accountIds: undefined }),
    );
  });

  it('honors explicit date boundaries together with allTime', async () => {
    await searchTransactions({ args: { allTime: true, endDate: '2024-01-01T00:00:00.000Z' } });

    expect(getTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: undefined, endDate: '2024-01-01T00:00:00.000Z' }),
    );
  });

  it('returns one page and an exact continuation when another row exists', async () => {
    jest.mocked(getTransactions).mockResolvedValue([{ id: 'first' }, { id: 'second' }, { id: 'next' }] as never);

    const result = await searchTransactions({ args: { allTime: true, limit: 2, offset: 4 } });

    expect(getTransactions).toHaveBeenCalledWith(expect.objectContaining({ limit: 3, from: 4 }));
    expect(result).toEqual({
      transactions: [{ id: 'first' }, { id: 'second' }],
      count: 2,
      limit: 2,
      offset: 4,
      hasMore: true,
      nextOffset: 6,
    });
  });

  it('marks an exactly full final page complete', async () => {
    jest.mocked(getTransactions).mockResolvedValue([{ id: 'first' }, { id: 'second' }] as never);

    const result = await searchTransactions({ args: { limit: 2 } });

    expect(result).toEqual({
      transactions: [{ id: 'first' }, { id: 'second' }],
      count: 2,
      limit: 2,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });
  });

  it('returns an empty completed page when there are no matching transactions', async () => {
    expect(await searchTransactions()).toEqual({
      transactions: [],
      count: 0,
      limit: 50,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });
  });

  it('caps the public page size while probing one extra row', async () => {
    const result = await searchTransactions({ args: { limit: 1000 } });

    expect(getTransactions).toHaveBeenCalledWith(expect.objectContaining({ limit: 501 }));
    expect(result.limit).toBe(500);
  });

  it.each([{ limit: 0 }, { limit: -1 }, { limit: 1.5 }, { offset: -1 }, { offset: 0.5 }])(
    'rejects an invalid pagination input %j',
    (args) => {
      expect(schema.safeParse(args).success).toBe(false);
    },
  );
});
