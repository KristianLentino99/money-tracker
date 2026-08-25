import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));

import { isMoneyMatterCache, isMoneyMatterRegistration, removeMoneyMatterPwa } from './pwa';

const registration = ({
  scriptPath,
  scope = '/',
  unregister = vi.fn(async () => true),
}: {
  scriptPath?: string;
  scope?: string;
  unregister?: ReturnType<typeof vi.fn>;
}) =>
  ({
    active: scriptPath ? { scriptURL: new URL(scriptPath, window.location.origin).toString() } : null,
    installing: null,
    scope: new URL(scope, window.location.origin).toString(),
    unregister,
    waiting: null,
  }) as unknown as ServiceWorkerRegistration;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MoneyMatter PWA ownership', () => {
  it.each([
    ['moneymatter-pwa-precache-v2-example', true],
    ['moneymatter-runtime-config', true],
    ['another-app-precache', false],
    ['budget-tracker-query-cache', false],
  ])('classifies cache %s', (cacheName, expected) => {
    expect(isMoneyMatterCache(cacheName)).toBe(expected);
  });

  it('recognizes the generated worker without claiming another worker', () => {
    expect(isMoneyMatterRegistration(registration({ scriptPath: '/sw.js' }))).toBe(true);
    expect(isMoneyMatterRegistration(registration({ scriptPath: '/other-sw.js' }))).toBe(false);
  });

  it('uses the root scope only when a registration has no worker yet', () => {
    expect(isMoneyMatterRegistration(registration({ scope: '/' }))).toBe(true);
    expect(isMoneyMatterRegistration(registration({ scope: '/other/' }))).toBe(false);
  });
});

describe('runtime PWA disable cleanup', () => {
  it('unregisters only MoneyMatter and preserves unrelated origin caches', async () => {
    const ownUnregister = vi.fn(async () => true);
    const foreignUnregister = vi.fn(async () => true);
    const registrations = [
      registration({ scriptPath: '/sw.js', unregister: ownUnregister }),
      registration({ scriptPath: '/other-sw.js', scope: '/other/', unregister: foreignUnregister }),
    ];
    const deleteCache = vi.fn(async () => true);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        getRegistrations: vi.fn(async () => registrations),
      },
    });
    vi.stubGlobal('caches', {
      delete: deleteCache,
      keys: vi.fn(async () => ['moneymatter-pwa-precache', 'moneymatter-runtime-config', 'another-app']),
    });

    await removeMoneyMatterPwa({ reloadControlledPage: false });

    expect(ownUnregister).toHaveBeenCalledOnce();
    expect(foreignUnregister).not.toHaveBeenCalled();
    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledWith('moneymatter-pwa-precache');
    expect(deleteCache).toHaveBeenCalledWith('moneymatter-runtime-config');
    expect(deleteCache).not.toHaveBeenCalledWith('another-app');
  });
});
