/**
 * Runtime-configurable app settings.
 *
 * Per key: `window.__APP_CONFIG__` (Docker entrypoint writes `/config.js`) →
 * `import.meta.env` (dev only, no entrypoint) → code default. `??` so a runtime
 * empty string still wins: an empty `apiHttp` selects same-origin (relative
 * `/api/v1`) mode.
 *
 * Getters are lazy, so read `config.x` inside a function to see `vi.stubEnv`
 * changes made after import. Module-level constants derived from `config` freeze
 * at first import.
 */

/** Shape of `window.__APP_CONFIG__`. Keys use runtime env-var names, no `VITE_` prefix. */
interface AppRuntimeConfig {
  API_HTTP?: string;
  API_VER?: string;
  IS_SELF_HOST?: string;
  MCP_BASE_URL?: string;
  POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;
  LOGO_DEV_TOKEN?: string;
  PWA_ENABLED?: string;
  PWA_APP_NAME?: string;
  PWA_SHORT_NAME?: string;
  PWA_THEME_COLOR?: string;
  PWA_BACKGROUND_COLOR?: string;
  PWA_ICON_192?: string;
  PWA_ICON_512?: string;
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: AppRuntimeConfig;
  }
}

const runtime = (): AppRuntimeConfig => (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};

export const config = {
  get apiHttp(): string | undefined {
    return runtime().API_HTTP ?? import.meta.env.VITE_APP_API_HTTP;
  },
  get apiVer(): string {
    return runtime().API_VER ?? import.meta.env.VITE_APP_API_VER ?? '/api/v1';
  },
  /**
   * No `import.meta.env` fallback: hosted and self-hosted share one image, and a
   * `VITE_` var is inlined at build time, so one bundle cannot answer differently
   * for the two.
   */
  get isSelfHost(): boolean {
    return runtime().IS_SELF_HOST === 'true';
  },
  get mcpBaseUrl(): string | undefined {
    return runtime().MCP_BASE_URL ?? import.meta.env.VITE_MCP_BASE_URL;
  },
  get posthogKey(): string | undefined {
    return runtime().POSTHOG_KEY ?? import.meta.env.VITE_POSTHOG_KEY;
  },
  get posthogHost(): string | undefined {
    return runtime().POSTHOG_HOST ?? import.meta.env.VITE_POSTHOG_HOST;
  },
  get logoDevToken(): string | undefined {
    return runtime().LOGO_DEV_TOKEN ?? import.meta.env.VITE_LOGO_DEV_TOKEN;
  },
  get pwaEnabled(): boolean {
    return runtime().PWA_ENABLED !== 'false';
  },
  get pwaAppName(): string {
    return runtime().PWA_APP_NAME || 'MoneyMatter';
  },
  get pwaShortName(): string {
    return runtime().PWA_SHORT_NAME || 'MoneyMatter';
  },
  get pwaThemeColor(): string {
    return runtime().PWA_THEME_COLOR || '#7355be';
  },
  get pwaBackgroundColor(): string {
    return runtime().PWA_BACKGROUND_COLOR || '#ffffff';
  },
  get sentryDsn(): string | undefined {
    return runtime().SENTRY_DSN ?? import.meta.env.VITE_SENTRY_DSN;
  },
  get sentryRelease(): string | undefined {
    return runtime().SENTRY_RELEASE ?? import.meta.env.VITE_SENTRY_RELEASE;
  },
};
