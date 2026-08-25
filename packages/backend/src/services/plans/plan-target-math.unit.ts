import { calculatePlanTarget } from './plan-target-math';

describe('calculatePlanTarget', () => {
  it('calculates a rounded-up monthly contribution for a yearly expense', () => {
    expect(
      calculatePlanTarget({
        targetAmountCents: 40_000,
        dueDate: '2027-08-31',
        periodStart: '2026-08-01',
        availableCents: 0,
        assignedCents: 0,
      }),
    ).toMatchObject({
      remainingCents: 40_000,
      monthlyAmountCents: 3_334,
      progressPercent: 0,
      isOnTrack: false,
    });
  });

  it('uses available money for progress and only asks for the remaining amount', () => {
    expect(
      calculatePlanTarget({
        targetAmountCents: 40_000,
        dueDate: '2027-08-31',
        periodStart: '2026-08-01',
        availableCents: 10_000,
        assignedCents: 3_334,
      }),
    ).toMatchObject({
      savedAmountCents: 10_000,
      remainingCents: 30_000,
      monthlyAmountCents: 2_500,
      progressPercent: 25,
      isOnTrack: true,
    });
  });

  it('does not let overspending produce negative progress', () => {
    expect(
      calculatePlanTarget({
        targetAmountCents: 40_000,
        dueDate: '2027-08-31',
        periodStart: '2026-08-01',
        availableCents: -2_000,
        assignedCents: 0,
      }),
    ).toMatchObject({ savedAmountCents: 0, remainingCents: 42_000, progressPercent: 0, isOnTrack: false });
  });
});
