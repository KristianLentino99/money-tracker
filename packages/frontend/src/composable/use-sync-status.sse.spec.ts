// The SSE connection is one shared stream for the whole app (bank sync, AI categorization,
// imports). Finishing a bank sync must not tear it down for the other listeners.
import { SSE_EVENT_TYPES } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const auth = vi.hoisted(() => ({ isLoggedIn: { value: true } }));
const user = vi.hoisted(() => ({ isDemo: { value: false } }));

// The fake transport: records the options `fetchEventSource` was opened with and lets a
// test push server events through the registered `onmessage`.
const transport = vi.hoisted(() => ({
  options: null as null | {
    signal: AbortSignal;
    onopen: (response: { ok: boolean; status: number }) => Promise<void>;
    onmessage: (event: { event: string; data: string }) => void;
  },
}));

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: (_url: string, options: NonNullable<typeof transport.options>) => {
    transport.options = options;
    void options.onopen({ ok: true, status: 200 });
    return new Promise<void>(() => {});
  },
}));

vi.mock('@/api/bank-data-providers', () => ({
  getSyncStatus: vi.fn(),
  checkSync: vi.fn(),
  triggerSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/common/const', () => ({
  VUE_QUERY_CACHE_KEYS: {
    bankSyncStatus: ['bankSyncStatus'],
    payeesList: ['payeesList'],
    payeesLookup: ['payeesLookup'],
    allAccounts: ['allAccounts'],
  },
  VUE_QUERY_GLOBAL_PREFIXES: { transactionChange: 'transactionChange', bankConnectionChange: 'bankConnectionChange' },
}));

vi.mock('@/lib/query-client', () => ({ invalidatePersistedQuery: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));
vi.mock('@/i18n', () => ({ ensureChunkLoaded: vi.fn() }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }));
vi.mock('@/stores/user', () => ({ useUserStore: () => user }));
vi.mock('pinia', () => ({ storeToRefs: (store: unknown) => store }));

const queryClient = vi.hoisted(() => ({
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('@tanstack/vue-query', () => ({
  useQueryClient: () => queryClient,
  useQuery: () => ({ data: ref(null), isFetching: ref(false), refetch: vi.fn() }),
  useMutation: ({ mutationFn }: { mutationFn: () => Promise<unknown> }) => ({
    isPending: ref(false),
    mutateAsync: mutationFn,
  }),
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import { useSSE } from './use-sse';
import { useSyncStatus } from './use-sync-status';

const snapshot = ({ syncing }: { syncing: number }) => ({ summary: { syncing, queued: 0 } });

const pushServerEvent = ({ event, payload }: { event: string; payload: unknown }) =>
  transport.options!.onmessage({ event, data: JSON.stringify(payload) });

describe('useSyncStatus completion vs. the shared SSE connection', () => {
  // The handler registry is module-global, so a test's listeners must not outlive it.
  const unsubscribers: Array<() => void> = [];

  afterEach(() => {
    unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useSSE().disconnect();
    transport.options = null;
  });

  const startSyncAndFinishIt = async () => {
    await useSyncStatus().triggerSync(true);
    queryClient.getQueryData.mockReturnValue(snapshot({ syncing: 1 }));
    pushServerEvent({ event: SSE_EVENT_TYPES.SYNC_STATUS_CHANGED, payload: snapshot({ syncing: 0 }) });
  };

  it('keeps the connection open and delivering events to other listeners after a sync completes', async () => {
    const categorizationEvents: unknown[] = [];
    unsubscribers.push(
      useSSE().on(SSE_EVENT_TYPES.AI_CATEGORIZATION_PROGRESS, (payload) => categorizationEvents.push(payload)),
    );

    await startSyncAndFinishIt();

    expect(transport.options!.signal.aborted).toBe(false);
    pushServerEvent({ event: SSE_EVENT_TYPES.AI_CATEGORIZATION_PROGRESS, payload: { status: 'completed' } });
    expect(categorizationEvents).toEqual([{ status: 'completed' }]);
  });

  it('closes the connection after a sync completes when nothing else is listening', async () => {
    await startSyncAndFinishIt();

    expect(transport.options!.signal.aborted).toBe(true);
  });
});
