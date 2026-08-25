const APP_NAME = 'MoneyMatter';
const THEME_COLOR = '#7355be';

export const pwaManifest = {
  id: '/',
  name: APP_NAME,
  short_name: APP_NAME,
  description: 'Track spending, plan budgets, and understand your financial future while keeping control of your data.',
  lang: 'en',
  dir: 'ltr',
  start_url: '/dashboard',
  scope: '/',
  display: 'standalone',
  theme_color: THEME_COLOR,
  background_color: '#ffffff',
  categories: ['finance', 'productivity'],
  icons: [
    {
      src: '/web-app-manifest-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/web-app-manifest-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: '/web-app-manifest-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/web-app-manifest-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
  screenshots: [
    {
      src: '/pwa-screenshot-narrow.png',
      sizes: '1024x1536',
      type: 'image/png',
      form_factor: 'narrow',
      label: 'MoneyMatter mobile financial overview',
    },
    {
      src: '/pwa-screenshot-wide.png',
      sizes: '1536x1024',
      type: 'image/png',
      form_factor: 'wide',
      label: 'MoneyMatter desktop financial overview',
    },
  ],
  shortcuts: [
    {
      name: 'Add transaction',
      short_name: 'Add',
      description: 'Record a new transaction',
      url: '/transactions?action=new',
      icons: [{ src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' }],
    },
    {
      name: 'Transactions',
      short_name: 'Transactions',
      description: 'Review your transactions',
      url: '/transactions',
      icons: [{ src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' }],
    },
    {
      name: 'Plan',
      short_name: 'Plan',
      description: 'Open your financial plan',
      url: '/plan',
      icons: [{ src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' }],
    },
  ],
};

const isSameOriginPath = ({ url, sameOrigin }, pathname) => sameOrigin && url.pathname === pathname;

export const pwaWorkbox = {
  cacheId: 'moneymatter-pwa',
  cleanupOutdatedCaches: true,
  clientsClaim: false,
  skipWaiting: false,
  navigateFallback: 'index.html',
  navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/config\.js$/, /^\/version\.json$/],
  globIgnores: ['**/*.map', '**/config.js', '**/version.json', '**/pwa-screenshot-*.png'],
  runtimeCaching: [
    {
      urlPattern: (context) => context.request.method === 'GET' && isSameOriginPath(context, '/config.js'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'moneymatter-runtime-config',
        networkTimeoutSeconds: 3,
        cacheableResponse: { statuses: [200] },
        expiration: { maxEntries: 1 },
      },
    },
    {
      urlPattern: (context) => isSameOriginPath(context, '/version.json'),
      handler: 'NetworkOnly',
    },
    {
      urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/api(?:\/|$)/.test(url.pathname),
      handler: 'NetworkOnly',
      method: 'GET',
    },
  ],
};
