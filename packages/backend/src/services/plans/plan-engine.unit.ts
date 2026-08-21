import { calculatePlanView } from './plan-engine';

describe('Plan engine', () => {
  it('calculates Ready to Assign, Activity, Available, and positive rollover', () => {
    const view = calculatePlanView({
      periodStart: '2026-08-01',
      periodStartDay: 1,
      accounts: [{ id: 'account-1', balanceCents: 100_00, isCreditCard: false }],
      categories: [{ id: 'category-1', name: 'Groceries', color: '#fff', icon: null, parentId: null, groupName: null }],
      assignments: [
        { categoryId: 'category-1', periodStart: '2026-07-01', assignedCents: 50_00 },
        { categoryId: 'category-1', periodStart: '2026-08-01', assignedCents: 20_00 },
      ],
      transactions: [{ categoryId: 'category-1', periodStart: '2026-08-01', amountCents: -15_00 }],
      upcomingObligations: [],
    });

    expect(view.readyToAssignCents).toBe(30_00);
    expect(view.categories[0]!).toMatchObject({ activityCents: -15_00, availableCents: 55_00 });
  });

  it('includes income and refunds as positive category activity', () => {
    const view = calculatePlanView({
      periodStart: '2026-08-01',
      periodStartDay: 1,
      accounts: [{ id: 'account-1', balanceCents: 100_00, isCreditCard: false }],
      categories: [{ id: 'category-1', name: 'Groceries', color: '#fff', icon: null, parentId: null, groupName: null }],
      assignments: [{ categoryId: 'category-1', periodStart: '2026-08-01', assignedCents: 50_00 }],
      transactions: [
        { categoryId: 'category-1', periodStart: '2026-08-01', amountCents: -25_00 },
        { categoryId: 'category-1', periodStart: '2026-08-01', amountCents: 10_00 },
      ],
      upcomingObligations: [],
    });

    expect(view.categories[0]).toMatchObject({ activityCents: -15_00, availableCents: 35_00 });
    expect(view.readyToAssignCents).toBe(50_00);
  });

  it('excludes credit-card balances from Ready to Assign', () => {
    const view = calculatePlanView({
      periodStart: '2026-08-01',
      periodStartDay: 1,
      accounts: [
        { id: 'cash', balanceCents: 100_00, isCreditCard: false },
        { id: 'card', balanceCents: -90_00, isCreditCard: true },
      ],
      categories: [],
      assignments: [],
      transactions: [],
      upcomingObligations: [],
    });

    expect(view.readyToAssignCents).toBe(100_00);
  });

  it('classifies funded, underfunded, and overspent categories without changing Ready to Assign', () => {
    const view = calculatePlanView({
      periodStart: '2026-08-01',
      periodStartDay: 1,
      accounts: [{ id: 'account-1', balanceCents: 100_00, isCreditCard: false }],
      categories: [
        { id: 'funded', name: 'Funded', color: '#fff', icon: null, parentId: null, groupName: null },
        { id: 'underfunded', name: 'Underfunded', color: '#fff', icon: null, parentId: null, groupName: null },
        { id: 'overspent', name: 'Overspent', color: '#fff', icon: null, parentId: null, groupName: null },
      ],
      assignments: [
        { categoryId: 'funded', periodStart: '2026-08-01', assignedCents: 100_00 },
        { categoryId: 'underfunded', periodStart: '2026-08-01', assignedCents: 20_00 },
      ],
      transactions: [{ categoryId: 'overspent', periodStart: '2026-08-01', amountCents: -10_00 }],
      upcomingObligations: [
        { categoryId: 'funded', periodStart: '2026-08-01', amountCents: 80_00 },
        { categoryId: 'underfunded', periodStart: '2026-08-01', amountCents: 50_00 },
      ],
    });

    expect(view.readyToAssignCents).toBe(-20_00);
    expect(view.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'funded', status: 'funded', underfundedByCents: 0 }),
        expect.objectContaining({ id: 'underfunded', status: 'underfunded', underfundedByCents: 30_00 }),
        expect.objectContaining({ id: 'overspent', status: 'overspent', availableCents: -10_00 }),
      ]),
    );
  });

  it('does not include future assignments in the selected period', () => {
    const view = calculatePlanView({
      periodStart: '2026-08-01',
      periodStartDay: 1,
      accounts: [{ id: 'account-1', balanceCents: 100_00, isCreditCard: false }],
      categories: [{ id: 'category-1', name: 'Future', color: '#fff', icon: null, parentId: null, groupName: null }],
      assignments: [{ categoryId: 'category-1', periodStart: '2026-09-01', assignedCents: 90_00 }],
      transactions: [],
      upcomingObligations: [],
    });

    expect(view.readyToAssignCents).toBe(100_00);
    expect(view.categories[0]).toMatchObject({ assignedCents: 0, availableCents: 0 });
  });

  it('does not carry cash overspending and reduces the next period Ready to Assign', () => {
    const view = calculatePlanView({
      periodStart: '2026-08-01',
      periodStartDay: 1,
      accounts: [{ id: 'account-1', balanceCents: 100_00, isCreditCard: false }],
      categories: [{ id: 'category-1', name: 'Dining', color: '#fff', icon: null, parentId: null, groupName: null }],
      assignments: [{ categoryId: 'category-1', periodStart: '2026-07-01', assignedCents: 10_00 }],
      transactions: [{ categoryId: 'category-1', periodStart: '2026-07-01', amountCents: -20_00 }],
      upcomingObligations: [],
    });

    expect(view.readyToAssignCents).toBe(80_00);
    expect(view.categories[0]!.availableCents).toBe(0);
  });
});
