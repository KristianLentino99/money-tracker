import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateMocks = vi.hoisted(() => ({
  activatePwaUpdate: vi.fn(async () => undefined),
  checkForPwaUpdate: vi.fn(async () => undefined),
  needRefresh: { value: false },
  stale: { value: false },
}));

vi.mock('@/composable/use-version-check', () => ({
  useVersionCheck: () => ({ isStale: updateMocks.stale }),
}));

vi.mock('@/lib/pwa', () => ({
  activatePwaUpdate: updateMocks.activatePwaUpdate,
  checkForPwaUpdate: updateMocks.checkForPwaUpdate,
  pwaState: { needRefresh: updateMocks.needRefresh },
}));

import { useAppUpdate } from './use-app-update';

beforeEach(() => {
  updateMocks.activatePwaUpdate.mockClear();
  updateMocks.checkForPwaUpdate.mockClear();
  updateMocks.needRefresh.value = false;
  updateMocks.stale.value = false;
});

describe('unified application update state', () => {
  it.each([
    { serviceWorkerWaiting: true, versionStale: false },
    { serviceWorkerWaiting: false, versionStale: true },
  ])(
    'shows one prompt for $serviceWorkerWaiting/$versionStale update state',
    ({ serviceWorkerWaiting, versionStale }) => {
      updateMocks.needRefresh.value = serviceWorkerWaiting;
      updateMocks.stale.value = versionStale;

      expect(useAppUpdate().isUpdateAvailable.value).toBe(true);
    },
  );

  it('activates a waiting worker through the shared update action', async () => {
    updateMocks.needRefresh.value = true;

    await useAppUpdate().applyUpdate();

    expect(updateMocks.checkForPwaUpdate).toHaveBeenCalledOnce();
    expect(updateMocks.activatePwaUpdate).toHaveBeenCalledOnce();
  });
});
