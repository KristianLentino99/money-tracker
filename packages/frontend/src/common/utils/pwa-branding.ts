import { config } from '@/common/config';

export const applyRuntimePwaBranding = () => {
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColor?.setAttribute('content', config.pwaThemeColor);

  const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  appleTitle?.setAttribute('content', config.pwaShortName);
};
