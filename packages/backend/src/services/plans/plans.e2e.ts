import { RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { randomUUID } from 'node:crypto';

const currentPeriodStart = () =>
  `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}-01`;

describe('Plan endpoints', () => {
  it('creates a blank Plan and returns a derived empty period view', async () => {
    const plan = await helpers.createPlan({
      payload: {
        name: 'HTTP Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [],
        accountIds: [],
      },
      raw: true,
    });

    const view = await helpers.getPlanView({ planId: plan.id, periodStart: currentPeriodStart(), raw: true });

    expect(view.plan.name).toBe('HTTP Plan');
    expect(view.groups).toEqual([]);
    expect(view.readyToAssign).toBe(0);
  });

  it('starts a new Plan from current balances without importing historical activity', async () => {
    const category = await helpers.addCustomCategory({ name: 'Fresh Plan Category', raw: true });
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Fresh Plan Cash', initialBalance: 100 }),
      raw: true,
    });
    const previousMonth = new Date();
    previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1, 15);
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: category.id,
        amount: 50,
        time: previousMonth.toISOString(),
      }),
      raw: true,
    });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Fresh Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [category.id],
        accountIds: [account.id],
      },
      raw: true,
    });

    const view = await helpers.getPlanView({ planId: plan.id, periodStart: currentPeriodStart(), raw: true });
    const row = view.groups.flatMap((group) => group.categories).find((item) => item.id === category.id);
    expect(view.readyToAssign).toBe(50);
    expect(row?.activity).toBe(0);
    expect(row?.available).toBe(0);
  });

  it('can opt into importing transactions from before Plan creation', async () => {
    const category = await helpers.addCustomCategory({ name: 'Historical Plan Category', raw: true });
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Historical Plan Cash', initialBalance: 100 }),
      raw: true,
    });
    const previousMonth = new Date();
    previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1, 15);
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: category.id,
        amount: 50,
        time: previousMonth.toISOString(),
      }),
      raw: true,
    });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Historical Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        includeHistoricalTransactions: true,
        categoryIds: [category.id],
        accountIds: [account.id],
      },
      raw: true,
    });

    const view = await helpers.getPlanView({ planId: plan.id, periodStart: currentPeriodStart(), raw: true });
    expect(view.readyToAssign).toBe(0);
  });

  it('keeps income categories and their descendants out of spending Plans', async () => {
    const income = (await helpers.getCategoriesList()).find((category) => category.key === 'income');
    expect(income).toBeDefined();
    const incomeChild = await helpers.addCustomCategory({ parentId: income!.id, name: 'Plan Income Child', raw: true });

    const rejected = await helpers.createPlan({
      payload: {
        name: 'Income Category Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [income!.id],
        accountIds: [],
      },
      raw: false,
    });
    expect(rejected.status).toBe(422);

    const plan = await helpers.createPlan({
      payload: {
        name: 'Filtered Category Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        accountIds: [],
      },
      raw: true,
    });
    const view = await helpers.getPlanView({ planId: plan.id, periodStart: currentPeriodStart(), raw: true });
    expect(view.groups.flatMap((group) => group.categories).some((category) => category.id === incomeChild.id)).toBe(
      false,
    );
  });

  it('assigns money through the HTTP endpoint and returns the recomputed view', async () => {
    const category = await helpers.addCustomCategory({ name: 'Plan Groceries', raw: true });
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Plan Cash', initialBalance: 100 }),
      raw: true,
    });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Allocation Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [category.id],
        accountIds: [account.id],
      },
      raw: true,
    });

    const result = await helpers.assignPlanCategory({
      planId: plan.id,
      periodStart: currentPeriodStart(),
      categoryId: category.id,
      payload: { assigned: 40, expectedRevision: 0, requestId: randomUUID() },
      raw: true,
    });

    const row = result.view.groups.flatMap((group) => group.categories).find((item) => item.id === category.id);
    expect(row?.assigned).toBe(40);
    expect(result.view.readyToAssign).toBe(60);
    expect(result.mutation.revision).toBe(1);
  });

  it('lists, reads, updates, archives, restores, and deletes non-default Plans', async () => {
    const plan = await helpers.createPlan({
      payload: {
        name: 'Lifecycle Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        periodStartDay: 15,
        categoryIds: [],
        accountIds: [],
      },
      raw: true,
    });

    expect((await helpers.getPlan({ planId: plan.id, raw: true })).name).toBe('Lifecycle Plan');
    expect((await helpers.getPlans({ raw: true })).some((item) => item.id === plan.id)).toBe(true);

    const updated = await helpers.updatePlan({
      planId: plan.id,
      payload: { name: 'Renamed Plan', periodStartDay: 20 },
      raw: true,
    });
    expect(updated.name).toBe('Renamed Plan');
    expect(updated.periodStartDay).toBe(20);

    const archived = await helpers.archivePlan({ planId: plan.id, archived: true, raw: true });
    expect(archived.status).toBe('archived');
    expect((await helpers.getPlans({ raw: true })).some((item) => item.id === plan.id)).toBe(false);
    expect((await helpers.getPlans({ status: 'archived', raw: true })).some((item) => item.id === plan.id)).toBe(true);

    const restored = await helpers.archivePlan({ planId: plan.id, archived: false, raw: true });
    expect(restored.status).toBe('active');

    await helpers.deletePlan({ planId: plan.id, raw: true });
    expect((await helpers.getPlan({ planId: plan.id, raw: false })).status).toBe(404);
  });

  it('protects the default Plan from permanent deletion', async () => {
    const plan = await helpers.createPlan({
      payload: {
        name: 'Protected Default Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        isDefault: true,
        categoryIds: [],
        accountIds: [],
      },
      raw: true,
    });

    const response = await helpers.deletePlan({ planId: plan.id, raw: false });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await helpers.getPlan({ planId: plan.id, raw: true })).id).toBe(plan.id);
  });

  it('moves money and applies bulk assignments atomically', async () => {
    const source = await helpers.addCustomCategory({ name: 'Move source', raw: true });
    const destination = await helpers.addCustomCategory({ name: 'Move destination', raw: true });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Move Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [source.id, destination.id],
        accountIds: [],
      },
      raw: true,
    });
    const periodStart = currentPeriodStart();

    const bulk = await helpers.bulkAssignPlanCategories({
      planId: plan.id,
      periodStart,
      payload: {
        assignments: [
          { categoryId: source.id, assigned: 60 },
          { categoryId: destination.id, assigned: 20 },
        ],
        expectedRevision: 0,
        requestId: randomUUID(),
      },
      raw: true,
    });
    expect(bulk.mutation.revision).toBe(1);

    const moved = await helpers.movePlanMoney({
      planId: plan.id,
      periodStart,
      payload: {
        sourceCategoryId: source.id,
        destinationCategoryId: destination.id,
        amount: 15,
        expectedRevision: 1,
        requestId: randomUUID(),
      },
      raw: true,
    });
    const rows = moved.view.groups.flatMap((group) => group.categories);
    expect(rows.find((row) => row.id === source.id)?.assigned).toBe(45);
    expect(rows.find((row) => row.id === destination.id)?.assigned).toBe(35);

    const failedBulk = await helpers.bulkAssignPlanCategories({
      planId: plan.id,
      periodStart,
      payload: {
        assignments: [
          { categoryId: source.id, assigned: 5 },
          { categoryId: generateRandomRecordId(), assigned: 10 },
        ],
        expectedRevision: 2,
        requestId: randomUUID(),
      },
      raw: false,
    });
    expect(failedBulk.status).toBeGreaterThanOrEqual(400);

    const afterFailure = await helpers.getPlanView({ planId: plan.id, periodStart, raw: true });
    expect(afterFailure.groups.flatMap((group) => group.categories).find((row) => row.id === source.id)?.assigned).toBe(
      45,
    );
    expect(afterFailure.period.revision).toBe(2);
  });

  it('attaches newly created top-level and subcategories to the Plan', async () => {
    const parent = await helpers.addCustomCategory({ name: 'Plan Parent Category', raw: true });
    const child = await helpers.addCustomCategory({ name: 'Plan Child Category', parentId: parent.id, raw: true });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Category Structure Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [parent.id],
        accountIds: [],
      },
      raw: true,
    });

    await helpers.addPlanCategory({ planId: plan.id, payload: { categoryId: child.id }, raw: true });
    const view = await helpers.getPlanView({ planId: plan.id, periodStart: currentPeriodStart(), raw: true });
    const parentGroup = view.groups.find((group) => group.categories.some((category) => category.id === child.id));
    expect(parentGroup?.categories.map((category) => category.id)).toContain(child.id);

    const duplicate = await helpers.addPlanCategory({ planId: plan.id, payload: { categoryId: child.id }, raw: false });
    expect(duplicate.status).toBe(409);
  });

  it('uses zero assignment to clear the sparse allocation for a category', async () => {
    const category = await helpers.addCustomCategory({ name: 'Sparse Plan Category', raw: true });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Sparse Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [category.id],
        accountIds: [],
      },
      raw: true,
    });
    const periodStart = currentPeriodStart();

    await helpers.assignPlanCategory({
      planId: plan.id,
      periodStart,
      categoryId: category.id,
      payload: { assigned: 12, expectedRevision: 0, requestId: randomUUID() },
      raw: true,
    });
    const cleared = await helpers.assignPlanCategory({
      planId: plan.id,
      periodStart,
      categoryId: category.id,
      payload: { assigned: 0, expectedRevision: 1, requestId: randomUUID() },
      raw: true,
    });

    expect(
      cleared.view.groups.flatMap((group) => group.categories).find((row) => row.id === category.id)?.assigned,
    ).toBe(0);
    expect(cleared.mutation.revision).toBe(2);
  });

  it('replays an idempotent allocation request and rejects request-id reuse with a different payload', async () => {
    const category = await helpers.addCustomCategory({ name: 'Idempotent Plan Category', raw: true });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Idempotent Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [category.id],
        accountIds: [],
      },
      raw: true,
    });
    const requestId = randomUUID();
    const payload = { assigned: 25, expectedRevision: 0, requestId };

    const first = await helpers.assignPlanCategory({
      planId: plan.id,
      periodStart: currentPeriodStart(),
      categoryId: category.id,
      payload,
      raw: true,
    });
    const replay = await helpers.assignPlanCategory({
      planId: plan.id,
      periodStart: currentPeriodStart(),
      categoryId: category.id,
      payload,
      raw: true,
    });
    expect(replay.mutation.eventId).toBe(first.mutation.eventId);
    expect(replay.mutation.revision).toBe(1);

    const reused = await helpers.assignPlanCategory({
      planId: plan.id,
      periodStart: currentPeriodStart(),
      categoryId: category.id,
      payload: { ...payload, assigned: 30 },
      raw: false,
    });
    expect(reused.status).toBe(409);
  });

  it('previews and applies previous-period Auto-Assign, then supports revision-aware Undo', async () => {
    const category = await helpers.addCustomCategory({ name: 'Auto Assign Category', raw: true });
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Auto Assign Cash', initialBalance: 100 }),
      raw: true,
    });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Auto Assign Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [category.id],
        accountIds: [account.id],
      },
      raw: true,
    });
    const periodStart = currentPeriodStart();
    const previousPeriod = new Date(`${periodStart}T00:00:00Z`);
    previousPeriod.setUTCMonth(previousPeriod.getUTCMonth() - 1);
    const previousPeriodStart = `${previousPeriod.getUTCFullYear()}-${String(previousPeriod.getUTCMonth() + 1).padStart(2, '0')}-01`;

    await helpers.assignPlanCategory({
      planId: plan.id,
      periodStart: previousPeriodStart,
      categoryId: category.id,
      payload: { assigned: 30, expectedRevision: 0, requestId: randomUUID() },
      raw: true,
    });

    const preview = (await helpers.previewPlanAutoAssign({ planId: plan.id, periodStart, raw: true })) as {
      changes: Array<{ categoryId: string; proposedAssigned: number }>;
      readyToAssignAfter: number;
    };
    expect(preview.changes).toEqual([{ categoryId: category.id, currentAssigned: 0, proposedAssigned: 30 }]);
    expect(preview.readyToAssignAfter).toBe(40);

    const applied = await helpers.autoAssignPlan({
      planId: plan.id,
      periodStart,
      payload: { expectedRevision: 0, requestId: randomUUID() },
      raw: true,
    });
    expect(
      applied.view.groups.flatMap((group) => group.categories).find((row) => row.id === category.id)?.assigned,
    ).toBe(30);

    const assigned = await helpers.assignPlanCategory({
      planId: plan.id,
      periodStart,
      categoryId: category.id,
      payload: { assigned: 40, expectedRevision: 1, requestId: randomUUID() },
      raw: true,
    });
    const undone = await helpers.undoPlanAllocation({
      planId: plan.id,
      periodStart,
      payload: { eventId: assigned.mutation.eventId, expectedRevision: 2, requestId: randomUUID() },
      raw: true,
    });
    expect(
      undone.view.groups.flatMap((group) => group.categories).find((row) => row.id === category.id)?.assigned,
    ).toBe(30);

    const unavailable = await helpers.undoPlanAllocation({
      planId: plan.id,
      periodStart,
      payload: { eventId: assigned.mutation.eventId, expectedRevision: 3, requestId: randomUUID() },
      raw: false,
    });
    expect(unavailable.status).toBe(409);
  });

  it('derives actual activity and upcoming obligations without counting forecast-only rows as activity', async () => {
    const category = await helpers.addCustomCategory({ name: 'Plan Transaction Category', raw: true });
    const splitCategory = await helpers.addCustomCategory({ name: 'Plan Split Category', raw: true });
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Plan Transaction Cash', initialBalance: 100 }),
      raw: true,
    });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Transaction Integration Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [category.id, splitCategory.id],
        accountIds: [account.id],
      },
      raw: true,
    });
    const transactionTime = new Date(`${currentPeriodStart()}T12:00:00.000Z`).toISOString();

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: category.id,
        amount: 20,
        time: transactionTime,
      }),
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 30,
        time: transactionTime,
        splits: [
          { categoryId: category.id, amount: 10 },
          { categoryId: splitCategory.id, amount: 20 },
        ],
      }),
      raw: true,
    });
    await helpers.createPlannedTransaction({
      payload: { accountId: account.id, categoryId: category.id, amount: 40, time: transactionTime },
      raw: true,
    });

    const view = await helpers.getPlanView({ planId: plan.id, periodStart: currentPeriodStart(), raw: true });
    const rows = view.groups.flatMap((group) => group.categories);
    expect(rows.find((row) => row.id === category.id)).toMatchObject({ activity: -30, upcomingObligation: 40 });
    expect(rows.find((row) => row.id === splitCategory.id)?.activity).toBe(-20);
    expect(view.upcomingObligations).toEqual([
      expect.objectContaining({ categoryId: category.id, amount: 40, count: 1 }),
    ]);
  });

  it('allows a shared write member to allocate through the same HTTP endpoint', async () => {
    const category = await helpers.addCustomCategory({ name: 'Shared Write Plan Category', raw: true });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Shared Write Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [category.id],
        accountIds: [],
      },
      raw: true,
    });
    const recipient = await helpers.signUpSecondUser({ name: 'Plan Writer' });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY.code }),
    });
    const invitation = await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.plan,
      resourceId: plan.id,
      permission: SHARE_PERMISSIONS.write,
      raw: true,
    });

    await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        await helpers.acceptShareInvitation({ token: invitation.token, raw: true });
        const result = await helpers.assignPlanCategory({
          planId: plan.id,
          periodStart: currentPeriodStart(),
          categoryId: category.id,
          payload: { assigned: 15, expectedRevision: 0, requestId: randomUUID() },
          raw: true,
        });
        expect(result.view.plan.canAllocate).toBe(true);
        expect(
          result.view.groups.flatMap((group) => group.categories).find((row) => row.id === category.id)?.assigned,
        ).toBe(15);
      },
    });
  });

  it('detaches deleted categories and accounts while keeping the Plan and historical assignment view stable', async () => {
    const category = await helpers.addCustomCategory({ name: 'Detached Plan Category', raw: true });
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Detached Plan Account', initialBalance: 25 }),
      raw: true,
    });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Detach Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [category.id],
        accountIds: [account.id],
      },
      raw: true,
    });
    const periodStart = currentPeriodStart();
    await helpers.assignPlanCategory({
      planId: plan.id,
      periodStart,
      categoryId: category.id,
      payload: { assigned: 10, expectedRevision: 0, requestId: randomUUID() },
      raw: true,
    });

    await helpers.deleteCustomCategory({ categoryId: category.id, raw: true });
    await helpers.deleteAccount({ id: account.id, raw: true });

    const view = await helpers.getPlanView({ planId: plan.id, periodStart, raw: true });
    expect(view.groups).toEqual([]);
    expect(view.plan.status).toBe('active');
  });

  it('allows an invited Plan member to read the shared view and keeps the Plan explicit-share only', async () => {
    const recipient = await helpers.signUpSecondUser({ name: 'Plan Recipient' });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY.code }),
    });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Shared Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [],
        accountIds: [],
      },
      raw: true,
    });

    const invitation = await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.plan,
      resourceId: plan.id,
      permission: SHARE_PERMISSIONS.read,
      raw: true,
    });
    expect(invitation.resourceType).toBe(RESOURCE_TYPES.plan);
    expect((await helpers.getPlan({ planId: plan.id, raw: true })).visibility).toBe('shared');

    await helpers.asUser({
      cookies: recipient.cookies,
      fn: async () => {
        await helpers.acceptShareInvitation({ token: invitation.token, raw: true });
        const view = await helpers.getPlanView({ planId: plan.id, periodStart: currentPeriodStart(), raw: true });
        expect(view.plan.canAllocate).toBe(false);
        expect(view.plan.canManage).toBe(false);
      },
    });
  });

  it('rejects missing Plans, negative assignments, and a base-currency mismatch', async () => {
    const missingView = await helpers.getPlanView({
      planId: generateRandomRecordId(),
      periodStart: currentPeriodStart(),
      raw: false,
    });
    expect(missingView.status).toBe(404);

    const category = await helpers.addCustomCategory({ name: 'Validation Plan Category', raw: true });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Validation Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [category.id],
        accountIds: [],
      },
      raw: true,
    });
    const negative = await helpers.assignPlanCategory({
      planId: plan.id,
      periodStart: currentPeriodStart(),
      categoryId: category.id,
      payload: { assigned: -1, expectedRevision: 0, requestId: randomUUID() },
      raw: false,
    });
    expect(negative.status).toBeGreaterThanOrEqual(400);

    const invalidTemplate = await helpers.createPlan({
      payload: {
        name: 'Invalid Template Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        templateId: 'does-not-exist',
        categoryIds: [],
        accountIds: [],
      },
      raw: false,
    });
    expect(invalidTemplate.status).toBeGreaterThanOrEqual(400);

    const otherCurrency = global.BASE_CURRENCY.code === 'USD' ? 'EUR' : 'USD';
    const currencyMismatch = await helpers.createPlan({
      payload: {
        name: 'Currency Mismatch Plan',
        baseCurrencyCode: otherCurrency,
        categoryIds: [],
        accountIds: [],
      },
      raw: false,
    });
    expect(currencyMismatch.status).toBeGreaterThanOrEqual(400);

    const baseCurrencyChange = await helpers.setBaseCurrencyForActiveUser({ currencyCode: otherCurrency });
    expect(baseCurrencyChange.statusCode).toBe(409);
  });

  it('rejects an allocation based on a stale period revision', async () => {
    const category = await helpers.addCustomCategory({ name: 'Stale Plan Category', raw: true });
    const plan = await helpers.createPlan({
      payload: {
        name: 'Stale Plan',
        baseCurrencyCode: global.BASE_CURRENCY.code,
        categoryIds: [category.id],
        accountIds: [],
      },
      raw: true,
    });

    const response = await helpers.assignPlanCategory({
      planId: plan.id,
      periodStart: currentPeriodStart(),
      categoryId: category.id,
      payload: { assigned: 10, expectedRevision: 99, requestId: randomUUID() },
      raw: false,
    });

    expect(response.status).toBe(409);
  });
});
