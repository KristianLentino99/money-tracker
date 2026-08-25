import { ROUTES_NAMES } from '@/routes/constants';

export type MobilePrimaryTab = 'home' | 'plan' | 'transactions' | 'accounts' | 'more';

export const MOBILE_PRIMARY_NAVIGATION = Object.freeze([
  { key: 'home', routeName: ROUTES_NAMES.home, labelKey: 'navigation.home' },
  { key: 'plan', routeName: ROUTES_NAMES.plan, labelKey: 'navigation.plan' },
  { key: 'transactions', routeName: ROUTES_NAMES.transactions, labelKey: 'navigation.transactions' },
  { key: 'accounts', routeName: ROUTES_NAMES.accounts, labelKey: 'navigation.accounts' },
  { key: 'more', routeName: ROUTES_NAMES.more, labelKey: 'navigation.more' },
] as const);

const ROUTE_NAMES_BY_TAB: Readonly<Record<MobilePrimaryTab, ReadonlySet<string>>> = {
  home: new Set([ROUTES_NAMES.home]),
  plan: new Set([ROUTES_NAMES.plan]),
  transactions: new Set([
    ROUTES_NAMES.transactions,
    ROUTES_NAMES.transactionGroups,
    ROUTES_NAMES.optimizations,
    ROUTES_NAMES.optimizationsTransfers,
    ROUTES_NAMES.optimizationsAiCategorization,
    ROUTES_NAMES.automations,
    ROUTES_NAMES.automationCreate,
    ROUTES_NAMES.automationDetails,
  ]),
  accounts: new Set([
    ROUTES_NAMES.accounts,
    ROUTES_NAMES.account,
    ROUTES_NAMES.accountsVehicleDetails,
    ROUTES_NAMES.accountIntegrationDetails,
    ROUTES_NAMES.loans,
    ROUTES_NAMES.loanDetail,
    ROUTES_NAMES.investments,
    ROUTES_NAMES.portfolioDetail,
    ROUTES_NAMES.portfolioTransactionsImport,
    ROUTES_NAMES.venture,
    ROUTES_NAMES.venturePlatformsList,
    ROUTES_NAMES.ventureDealDetail,
  ]),
  more: new Set([
    ROUTES_NAMES.more,
    ROUTES_NAMES.planned,
    ROUTES_NAMES.plannedSubscriptions,
    ROUTES_NAMES.plannedSubscriptionDetails,
    ROUTES_NAMES.analytics,
    ROUTES_NAMES.analyticsCashFlow,
    ROUTES_NAMES.analyticsNetWorthHistory,
    ROUTES_NAMES.analyticsNetWorthDrivers,
    ROUTES_NAMES.analyticsInvestmentContributions,
    ROUTES_NAMES.analyticsPivotReport,
    ROUTES_NAMES.analyticsInvestmentCalculator,
    ROUTES_NAMES.analyticsTrendsComparison,
    ROUTES_NAMES.settings,
    ROUTES_NAMES.settingsCurrencies,
    ROUTES_NAMES.settingsCategories,
    ROUTES_NAMES.settingsTags,
    ROUTES_NAMES.settingsPayees,
    ROUTES_NAMES.settingsPayeesManage,
    ROUTES_NAMES.settingsPayeesSettings,
    ROUTES_NAMES.settingsPayeeDetail,
    ROUTES_NAMES.settingsAccounts,
    ROUTES_NAMES.settingsDataManagement,
    ROUTES_NAMES.settingsDataManagementImport,
    ROUTES_NAMES.settingsDataManagementExport,
    ROUTES_NAMES.settingsDataManagementExportConfigure,
    ROUTES_NAMES.settingsAppearance,
    ROUTES_NAMES.settingsLanguage,
    ROUTES_NAMES.settingsGeneral,
    ROUTES_NAMES.settingsAi,
    ROUTES_NAMES.settingsAiFeatures,
    ROUTES_NAMES.settingsAiKeys,
    ROUTES_NAMES.settingsAiEndpoints,
    ROUTES_NAMES.settingsSecurity,
    ROUTES_NAMES.settingsSecurityLoginMethods,
    ROUTES_NAMES.settingsSecuritySessions,
    ROUTES_NAMES.settingsSecurityPassword,
    ROUTES_NAMES.settingsSecurityBackup,
    ROUTES_NAMES.settingsSecurityDanger,
    ROUTES_NAMES.settingsAdmin,
    ROUTES_NAMES.settingsAiIntegrations,
    ROUTES_NAMES.settingsSharedWithMe,
    ROUTES_NAMES.settingsHousehold,
    ROUTES_NAMES.settingsSubscriptions,
    ROUTES_NAMES.importCsv,
    ROUTES_NAMES.importStatement,
    ROUTES_NAMES.importYnab,
    ROUTES_NAMES.importBudgetBakersWallet,
    ROUTES_NAMES.importMsMoney,
    ROUTES_NAMES.importHistory,
  ]),
};

export function isMobileTabActive({
  tab,
  routeName,
}: {
  tab: MobilePrimaryTab;
  routeName: string | symbol | null | undefined;
}) {
  return typeof routeName === 'string' && ROUTE_NAMES_BY_TAB[tab].has(routeName);
}
