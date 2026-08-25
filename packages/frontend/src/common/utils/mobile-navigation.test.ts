import { ROUTES_NAMES } from '@/routes/constants';

import { isMobileTabActive, MOBILE_PRIMARY_NAVIGATION } from './mobile-navigation';

describe('mobile navigation', () => {
  it('keeps the primary navigation to five one-row tabs', () => {
    expect(MOBILE_PRIMARY_NAVIGATION).toHaveLength(5);
    expect(MOBILE_PRIMARY_NAVIGATION.map((tab) => tab.key)).toEqual([
      'home',
      'plan',
      'transactions',
      'accounts',
      'more',
    ]);
  });

  it('keeps transaction tools under the Transactions tab', () => {
    expect(isMobileTabActive({ tab: 'transactions', routeName: ROUTES_NAMES.transactionGroups })).toBe(true);
    expect(isMobileTabActive({ tab: 'transactions', routeName: ROUTES_NAMES.automationDetails })).toBe(true);
    expect(isMobileTabActive({ tab: 'more', routeName: ROUTES_NAMES.automationDetails })).toBe(false);
  });

  it('keeps nested account and settings routes reachable with a stable active tab', () => {
    expect(isMobileTabActive({ tab: 'accounts', routeName: ROUTES_NAMES.portfolioDetail })).toBe(true);
    expect(isMobileTabActive({ tab: 'more', routeName: ROUTES_NAMES.settingsSecuritySessions })).toBe(true);
    expect(isMobileTabActive({ tab: 'accounts', routeName: ROUTES_NAMES.settingsSecuritySessions })).toBe(false);
  });
});
