import { config } from '@/common/config';
import { captureException } from '@/lib/sentry';
import { readonly, ref, watch } from 'vue';

const PWA_WORKER_PATH = '/sw.js';
const PWA_DISABLE_RELOAD_KEY = 'moneymatter:pwa-disable-reload';
const PWA_UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const PWA_CACHE_PREFIXES = ['moneymatter-pwa', 'moneymatter-runtime-config'] as const;

const needRefresh = ref(false);
const offlineReady = ref(false);
let registration: ServiceWorkerRegistration | undefined;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;
let initialized = false;

export const isMoneyMatterCache = (cacheName: string): boolean =>
  PWA_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix));

const workerScriptUrl = (worker: ServiceWorker | null | undefined): string | undefined => worker?.scriptURL;

export const isMoneyMatterRegistration = (candidate: ServiceWorkerRegistration): boolean => {
  const scriptUrl =
    workerScriptUrl(candidate.active) ?? workerScriptUrl(candidate.waiting) ?? workerScriptUrl(candidate.installing);

  if (scriptUrl) {
    return new URL(scriptUrl).pathname === PWA_WORKER_PATH;
  }

  return candidate.scope === `${window.location.origin}/`;
};

export const removeMoneyMatterPwa = async ({ reloadControlledPage = true } = {}): Promise<void> => {
  if (!('serviceWorker' in navigator)) return;

  const controllerWasMoneyMatter = navigator.serviceWorker.controller
    ? new URL(navigator.serviceWorker.controller.scriptURL).pathname === PWA_WORKER_PATH
    : false;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.filter(isMoneyMatterRegistration).map((candidate) => candidate.unregister()));

  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter(isMoneyMatterCache).map((cacheName) => caches.delete(cacheName)));
  }

  if (reloadControlledPage && controllerWasMoneyMatter && !sessionStorage.getItem(PWA_DISABLE_RELOAD_KEY)) {
    sessionStorage.setItem(PWA_DISABLE_RELOAD_KEY, 'true');
    window.location.reload();
    return;
  }

  if (!controllerWasMoneyMatter) {
    sessionStorage.removeItem(PWA_DISABLE_RELOAD_KEY);
  }
};

const scheduleUpdateChecks = () => {
  const check = () => {
    if (document.visibilityState === 'visible') {
      void registration?.update();
    }
  };

  window.setInterval(check, PWA_UPDATE_INTERVAL_MS);
  document.addEventListener('visibilitychange', check);
};

export const initializePwa = async (): Promise<void> => {
  if (initialized || import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  initialized = true;

  if (!config.pwaEnabled) {
    await removeMoneyMatterPwa();
    return;
  }

  try {
    const { useRegisterSW } = await import('virtual:pwa-register/vue');
    const state = useRegisterSW({
      immediate: true,
      onRegisteredSW(_serviceWorkerUrl, registered) {
        registration = registered;
        scheduleUpdateChecks();
      },
      onRegisterError(error) {
        captureException({ error, context: { scope: 'pwa:registration' } });
      },
    });

    updateServiceWorker = state.updateServiceWorker;
    watch(state.needRefresh, (value) => (needRefresh.value = value), { immediate: true });
    watch(state.offlineReady, (value) => (offlineReady.value = value), { immediate: true });
  } catch (error) {
    captureException({ error, context: { scope: 'pwa:initialization' } });
  }
};

export const checkForPwaUpdate = async (): Promise<void> => {
  await registration?.update();
};

export const activatePwaUpdate = async (): Promise<void> => {
  await updateServiceWorker?.(true);
};

export const pwaState = {
  needRefresh: readonly(needRefresh),
  offlineReady: readonly(offlineReady),
};
