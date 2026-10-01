import type { LoanApiResponse, endpointsTypes } from '@bt/shared/types';
import type { ManualPortfolioOverviewModel } from '@bt/shared/types/investments';
import { afterEach, describe, expect, it } from '@jest/globals';
import type { VehicleMaintenanceVisitApiResponse } from '@root/serializers/vehicle-maintenance-visits.serializer';
import type { VehicleApiResponse } from '@root/serializers/vehicles.serializer';
import * as helpers from '@tests/helpers';
import * as mcp from '@tests/helpers/mcp';
import { addMonths, format } from 'date-fns';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const sessions: mcp.McpTestSession[] = [];
const initialize = async ({ scopes }: { scopes?: string[] } = {}) => {
  const session = await mcp.initializeMcpSession({ scopes });
  sessions.push(session);
  return session;
};

afterEach(async () => {
  for (const session of sessions.splice(0)) await mcp.closeMcpSession({ session });
  await mcp.cleanupTestOAuthData();
});

describe('MCP HTTP feature parity', () => {
  it('allocates decimal plan amounts idempotently and rejects stale revisions', async () => {
    const session = await initialize();
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 500 }),
      raw: true,
    });
    const plan = mcp.parseMcpToolData<endpointsTypes.PlanSummaryResponse>({
      response: await mcp.callMcpTool({
        session,
        name: 'create_plan',
        args: {
          name: 'MCP plan',
          baseCurrencyCode: global.BASE_CURRENCY.code,
          accountIds: [account.id],
          categoryIds: [global.DEFAULT_CATEGORY_ID],
          includeHistoricalTransactions: true,
        },
      }),
    });
    const periodStart = `${new Date().toISOString().slice(0, 7)}-01`;
    const view = mcp.parseMcpToolData<endpointsTypes.PlanViewResponse>({
      response: await mcp.callMcpTool({
        session,
        name: 'get_plan_view',
        args: { planId: plan.id, periodStart },
      }),
    });
    const args = {
      planId: plan.id,
      periodStart,
      categoryId: global.DEFAULT_CATEGORY_ID,
      assigned: 12.34,
      expectedRevision: view.period.revision,
      requestId: randomUUID(),
    };
    const first = mcp.parseMcpToolData<endpointsTypes.PlanMutationResponse>({
      response: await mcp.callMcpTool({ session, name: 'assign_plan_category', args }),
    });
    const replay = mcp.parseMcpToolData<endpointsTypes.PlanMutationResponse>({
      response: await mcp.callMcpTool({ session, name: 'assign_plan_category', args }),
    });
    expect(replay.mutation.eventId).toBe(first.mutation.eventId);
    expect(replay.view.period.revision).toBe(first.view.period.revision);
    const restView = await helpers.getPlanView({ planId: plan.id, periodStart, raw: true });
    expect(
      restView.groups
        .flatMap((group) => group.categories)
        .find((category) => category.id === global.DEFAULT_CATEGORY_ID)?.assigned,
    ).toBe(12.34);
    const stale = await mcp.callMcpTool({
      session,
      name: 'assign_plan_category',
      args: { ...args, assigned: 99, requestId: randomUUID() },
    });
    expect(stale.result?.isError).toBe(true);
  });

  it('creates a loan with decimal liability balances and rejects invalid update combinations', async () => {
    const session = await initialize();
    const loan = mcp.parseMcpToolData<LoanApiResponse>({
      response: await mcp.callMcpTool({
        session,
        name: 'create_loan',
        args: {
          name: 'MCP loan',
          currencyCode: global.BASE_CURRENCY.code,
          initialBalance: 100.25,
          originalPrincipal: 200,
          loanType: 'personal',
          interestRate: 0,
          startDate: new Date().toISOString().slice(0, 10),
        },
      }),
    });
    expect(loan.currentBalance).toBe(-100.25);
    for (const fields of [{}, { currentBalanceAsOf: new Date().toISOString().slice(0, 10) }]) {
      const response = await mcp.callMcpTool({
        session,
        name: 'update_loan',
        args: { loanAccountId: loan.id, data: fields },
      });
      expect(response.result?.isError).toBe(true);
    }
    const updated = mcp.parseMcpToolData<LoanApiResponse>({
      response: await mcp.callMcpTool({
        session,
        name: 'update_loan',
        args: {
          loanAccountId: loan.id,
          data: {
            currentBalance: 88.76,
            currentBalanceAsOf: new Date().toISOString().slice(0, 10),
            minPayment: 10.25,
            plannedPayment: 12.34,
          },
        },
      }),
    });
    expect(updated.currentBalance).toBe(-88.76);
    expect(updated.loanDetails.minPayment).toBe(10.25);
    expect(updated.loanDetails.plannedPayment).toBe(12.34);
    const persisted = await helpers.getLoanById({ id: loan.id, raw: true });
    expect(persisted.currentBalance).toBe(-88.76);
    expect(persisted.loanDetails.plannedPayment).toBe(12.34);
  });

  it('records vehicle maintenance and generated expenses in decimal amounts through MCP', async () => {
    const session = await initialize();
    const account = await helpers.createAccount({ raw: true });
    const today = new Date().toISOString().slice(0, 10);
    const vehicle = mcp.parseMcpToolData<VehicleApiResponse>({
      response: await mcp.callMcpTool({
        session,
        name: 'create_vehicle',
        args: {
          data: {
            name: 'MCP car',
            make: 'Test',
            model: 'Test',
            year: 2025,
            vehicleClass: 'sedan',
            currencyCode: global.BASE_CURRENCY.code,
            purchasePrice: 10000.5,
            purchaseDate: today,
            currentMileage: 1234,
          },
        },
      }),
    });
    expect(vehicle.purchasePrice).toBe(10000.5);
    expect(vehicle.currentMileage).toBe(1234);
    const visit = mcp.parseMcpToolData<VehicleMaintenanceVisitApiResponse>({
      response: await mcp.callMcpTool({
        session,
        name: 'create_vehicle_maintenance_visit',
        args: {
          vehicleId: vehicle.id,
          data: {
            serviceDate: today,
            activities: [{ label: 'Oil change' }],
            quickExpense: {
              accountId: account.id,
              categoryId: global.DEFAULT_CATEGORY_ID,
              amount: 45.67,
              date: today,
              paymentType: 'creditCard',
            },
          },
        },
      }),
    });
    expect(visit.totalCost).toBe(45.67);
    expect(visit.generatedTransactionIds).toHaveLength(1);
    const maintenance = mcp.parseMcpToolData<{ visits: VehicleMaintenanceVisitApiResponse[] }>({
      response: await mcp.callMcpTool({ session, name: 'get_vehicle_maintenance', args: { vehicleId: vehicle.id } }),
    });
    expect(maintenance.visits[0]?.totalCost).toBe(45.67);
  });

  it('records manual portfolio contributions and valuations in the portfolio currency', async () => {
    const session = await initialize();
    const today = new Date().toISOString().slice(0, 10);
    const portfolio = mcp.parseMcpToolData<{ id: string }>({
      response: await mcp.callMcpTool({
        session,
        name: 'create_portfolio',
        args: {
          name: 'MCP manual portfolio',
          portfolioType: 'investment',
          isManualTracking: true,
          displayCurrencyCode: global.BASE_CURRENCY.code,
        },
      }),
    });
    for (const [name, args] of [
      [
        'manage_manual_portfolio_transaction',
        { action: 'create', transaction: { category: 'contribution', amount: '25.34', date: today } },
      ],
      ['manage_manual_portfolio_valuation', { action: 'create', valuation: { value: '27.45', date: today } }],
    ] as const) {
      mcp.parseMcpToolData({
        response: await mcp.callMcpTool({ session, name, args: { portfolioId: portfolio.id, ...args } }),
      });
    }
    const overview = mcp.parseMcpToolData<ManualPortfolioOverviewModel>({
      response: await mcp.callMcpTool({ session, name: 'get_manual_portfolio', args: { portfolioId: portfolio.id } }),
    });
    expect(overview.currentValue).toBe('27.45');
    expect(overview.totals.contribution).toBe('25.34');
  });

  it('pays a loan-linked installment through MCP and exposes the resulting loan balance', async () => {
    const session = await initialize();
    const loan = await helpers.createLoan({
      payload: helpers.buildCreateLoanPayload({
        initialBalance: 100,
        originalPrincipal: 100,
        currencyCode: global.BASE_CURRENCY.code,
      }),
      raw: true,
    });
    const account = await helpers.createAccount({ raw: true });
    const dueDate = format(addMonths(new Date(), 1), 'yyyy-MM-dd');
    const subscription = mcp.parseMcpToolData<{ id: string }>({
      response: await mcp.callMcpTool({
        session,
        name: 'create_subscription',
        args: {
          name: 'MCP installment',
          type: 'installment',
          frequency: 'monthly',
          startDate: dueDate,
          dueDate,
          maxOccurrences: 2,
          expectedAmount: 25.34,
          expectedCurrencyCode: global.BASE_CURRENCY.code,
          accountId: account.id,
          categoryId: global.DEFAULT_CATEGORY_ID,
        },
      }),
    });
    mcp.parseMcpToolData({
      response: await mcp.callMcpTool({
        session,
        name: 'link_installment_to_loan',
        args: { subscriptionId: subscription.id, loanAccountId: loan.id },
      }),
    });
    const periods = mcp.parseMcpToolData<{ periods: Array<{ id: string; status: string }> }>({
      response: await mcp.callMcpTool({
        session,
        name: 'get_subscription_periods',
        args: { subscriptionId: subscription.id },
      }),
    });
    const period = periods.periods.find((item) => item.status === 'upcoming');
    expect(period).toBeDefined();
    mcp.parseMcpToolData({
      response: await mcp.callMcpTool({
        session,
        name: 'pay_subscription_period',
        args: {
          subscriptionId: subscription.id,
          periodId: period!.id,
          createTransaction: true,
          time: new Date().toISOString(),
        },
      }),
    });
    const detail = mcp.parseMcpToolData<LoanApiResponse>({
      response: await mcp.callMcpTool({ session, name: 'get_loan', args: { loanAccountId: loan.id } }),
    });
    expect(detail.currentBalance).toBe(-74.66);
    expect(detail.loanInstallments).toHaveLength(1);
    expect(detail.paymentsCount).toBe(1);
  });

  it('groups purchases under one contribution and requires explicit deletion of linked purchases', async () => {
    const session = await initialize();
    const portfolio = await helpers.createPortfolio({ raw: true });
    const account = await helpers.createAccount({ raw: true });
    const [security] = await helpers.seedSecurities([
      { symbol: 'MCPTEST', name: 'MCP test fixture', currencyCode: global.BASE_CURRENCY.code },
    ]);
    mcp.parseMcpToolData({
      response: await mcp.callMcpTool({
        session,
        name: 'create_holding',
        args: { portfolioId: portfolio.id, securityId: security!.id },
      }),
    });
    const transfer = mcp.parseMcpToolData<{
      id: string;
      amount: string;
      transactionId: string;
      investmentTransactions: unknown[];
    }>({
      response: await mcp.callMcpTool({
        session,
        name: 'create_investment_contribution',
        args: {
          portfolioId: portfolio.id,
          accountId: account.id,
          amount: '50.34',
          date: new Date().toISOString().slice(0, 10),
          categoryId: global.DEFAULT_CATEGORY_ID,
          purchases: [
            {
              securityId: security!.id,
              quantity: '2',
              price: '25.17',
              fees: '0',
              date: new Date().toISOString().slice(0, 10),
            },
          ],
        },
      }),
    });
    expect(Number(transfer.amount)).toBe(50.34);
    expect(transfer.investmentTransactions).toHaveLength(1);
    const denied = await mcp.callMcpTool({
      session,
      name: 'delete_portfolio_transfer',
      args: { transferId: transfer.id },
    });
    expect(denied.result?.isError).toBe(true);
    mcp.parseMcpToolData({
      response: await mcp.callMcpTool({
        session,
        name: 'delete_portfolio_transfer',
        args: { transferId: transfer.id, deleteLinkedInvestmentTransactions: true },
      }),
    });
    const transactions = await helpers.getTransactions({ raw: true });
    expect(transactions.find((item) => item.id === transfer.transactionId)?.amount).toBe(50.34);
  });
  it('advertises the fork capabilities and serializable input schemas over the actual SDK', async () => {
    const session = await initialize();
    const response = await mcp.listMcpTools({ session });
    expect(response.error).toBeUndefined();
    const tools = response.result!.tools;
    const names = tools.map((tool) => tool.name);
    const card = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../../frontend/public/.well-known/mcp/server-card.json'), 'utf8'),
    ) as { tools: Array<{ name: string }> };
    expect([...names].sort()).toEqual(card.tools.map((tool) => tool.name).sort());
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'get_plans',
        'create_plan',
        'get_plan_view',
        'assign_plan_category',
        'auto_assign_plan',
        'get_loans',
        'create_loan',
        'link_loan_payments',
        'get_subscription_periods',
        'pay_subscription_period',
        'link_installment_to_loan',
        'get_vehicles',
        'create_vehicle_maintenance_visit',
        'get_vehicle_maintenance_reminders',
        'create_investment_contribution',
        'get_manual_portfolio',
        'create_holding',
        'create_attachment_upload_url',
        'get_transaction_automations',
      ]),
    );
    expect(names).not.toContain('get_budgets');
    for (const tool of tools) expect(tool.inputSchema.type).toBe('object');
  });

  it('returns empty state for the fork domain collections', async () => {
    const session = await initialize();
    for (const name of ['get_plans', 'get_loans', 'get_vehicles', 'get_vehicle_maintenance_reminders']) {
      const response = await mcp.callMcpTool({ session, name });
      expect(mcp.parseMcpToolData<unknown>({ response })).toEqual([]);
    }
  });

  it('rejects writes with read-only OAuth scopes', async () => {
    const session = await initialize({ scopes: ['finance:read', 'profile:read'] });
    const response = await mcp.callMcpTool({
      session,
      name: 'create_plan',
      args: {
        name: 'Rejected MCP Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
      },
    });
    expect(response.result?.isError).toBe(true);
    expect(response.result?.content[0]?.text).toContain('finance:write');
    expect(await helpers.getPlans({ raw: true })).toEqual([]);
  });

  it('rejects invalid input and inaccessible plan IDs', async () => {
    const session = await initialize();
    const malformed = await mcp.callMcpTool({ session, name: 'create_plan', args: { name: '' } });
    expect(Boolean(malformed.error || malformed.result?.isError)).toBe(true);
    const missing = await mcp.callMcpTool({ session, name: 'get_plan', args: { planId: randomUUID() } });
    expect(missing.result?.isError).toBe(true);
  });
});
