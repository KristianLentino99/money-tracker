import { afterEach, describe, expect, it } from 'vitest';

import { applyRuntimePwaBranding } from './pwa-branding';

afterEach(() => {
  window.__APP_CONFIG__ = {};
  document.head.innerHTML = '';
});

describe('runtime PWA branding', () => {
  it('applies configured install name and browser color', () => {
    document.head.innerHTML = `
      <meta name="theme-color" content="#000000" />
      <meta name="apple-mobile-web-app-title" content="Old name" />
    `;
    window.__APP_CONFIG__ = {
      PWA_SHORT_NAME: 'My Money',
      PWA_THEME_COLOR: '#123456',
    };

    applyRuntimePwaBranding();

    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#123456');
    expect(document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')).toBe('My Money');
  });

  it('uses MoneyMatter defaults when runtime branding is empty', () => {
    document.head.innerHTML = `
      <meta name="theme-color" />
      <meta name="apple-mobile-web-app-title" />
    `;
    window.__APP_CONFIG__ = {};

    applyRuntimePwaBranding();

    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#7355be');
    expect(document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')).toBe(
      'MoneyMatter',
    );
  });
});
