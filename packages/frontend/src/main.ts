import '@/styles/global.css';

import { installChunkReloadHandler } from '@/common/utils/chunk-reload-handler';
import { identifyCurrentTheme } from '@/common/utils/color-theme';
import { patchMetaViewportMaxScaleForiOS } from '@/common/utils/meta-viewport-max-scale';
import { applyRuntimePwaBranding } from '@/common/utils/pwa-branding';
import { i18n, initializeLocale, loadChunks } from '@/i18n';
import { initPostHog, trackPageviews } from '@/lib/posthog';
import { initializePwa } from '@/lib/pwa';
import { queryClient } from '@/lib/query-client';
import { initSentry } from '@/lib/sentry';
import { router } from '@/routes';
import { store } from '@/stores/setup';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createHead } from '@unhead/vue/client';
import { createApp } from 'vue';

import App from './app.vue';

identifyCurrentTheme();
applyRuntimePwaBranding();
patchMetaViewportMaxScaleForiOS();
if (!import.meta.env.DEV) {
  installChunkReloadHandler({ router });
}

// Initialize locale from localStorage/browser
const initialLocale = initializeLocale();

// Load common chunk for the initial locale (if not English, English is preloaded)
// The route guard will load page-specific chunks on navigation
const initI18n = async () => {
  if (initialLocale !== 'en') {
    // For non-English locales, load the common chunk
    await loadChunks({ locale: initialLocale, chunks: ['common'] });
    i18n.global.locale.value = initialLocale as 'en' | 'uk' | 'es' | 'id' | 'it';
    document.documentElement.lang = initialLocale;
  }
};

// Initialize i18n before mounting
initI18n()
  .catch((err) => {
    console.warn('i18n initialization failed, using defaults:', err);
  })
  .finally(async () => {
    const app = createApp(App);
    const head = createHead();

    // Initialize Sentry before mounting (must be early to catch errors)
    initSentry({ app, router });
    await initializePwa();

    initPostHog();
    trackPageviews({ router });

    app.use(router);
    app.use(store);
    app.use(head);
    app.use(i18n); // Register vue-i18n plugin

    app.use(VueQueryPlugin, { queryClient });

    app.mount('#app');
  });
