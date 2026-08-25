import { ROUTES_NAMES } from '@/routes/constants';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';

import MobileNavigation from './mobile-navigation.vue';

const routeComponent = { template: '<div />' };

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/dashboard', name: ROUTES_NAMES.home, component: routeComponent },
      { path: '/plan', name: ROUTES_NAMES.plan, component: routeComponent },
      { path: '/transactions', name: ROUTES_NAMES.transactions, component: routeComponent },
      { path: '/accounts', name: ROUTES_NAMES.accounts, component: routeComponent },
      { path: '/more', name: ROUTES_NAMES.more, component: routeComponent },
      { path: '/settings/security/sessions', name: ROUTES_NAMES.settingsSecuritySessions, component: routeComponent },
    ],
  });
}

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        navigation: {
          home: 'Home',
          plan: 'Plan',
          transactions: 'Transactions',
          accounts: 'Accounts',
          more: 'More',
          dashboard: 'Dashboard',
        },
      },
    },
  });
}

async function mountNavigation({ routeName }: { routeName: string }) {
  const router = createTestRouter();
  await router.push({ name: routeName });
  await router.isReady();

  const wrapper = mount(MobileNavigation, {
    global: {
      plugins: [router, createTestI18n()],
    },
  });

  return { router, wrapper };
}

describe('MobileNavigation', () => {
  it('renders the five primary tabs with accessible names', async () => {
    const { wrapper } = await mountNavigation({ routeName: ROUTES_NAMES.home });

    expect(wrapper.findAll('[data-mobile-tab]')).toHaveLength(5);
    expect(wrapper.find('[data-mobile-tab="home"]').text()).toContain('Home');
    expect(wrapper.find('[data-mobile-tab="more"]').text()).toContain('More');
    expect(wrapper.findAll('[aria-label]').map((element) => element.attributes('aria-label'))).toContain(
      'Transactions',
    );
  });

  it('marks a nested settings route as More without changing the five-tab layout', async () => {
    const { wrapper } = await mountNavigation({ routeName: ROUTES_NAMES.settingsSecuritySessions });

    expect(wrapper.find('[data-mobile-tab="more"] [aria-current="page"]').exists()).toBe(true);
    expect(wrapper.find('[data-mobile-tab="accounts"] [aria-current="page"]').exists()).toBe(false);
  });
});
