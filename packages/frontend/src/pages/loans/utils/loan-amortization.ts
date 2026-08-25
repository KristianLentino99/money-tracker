import { addMonths, differenceInCalendarMonths } from 'date-fns';

import { roundHalfToEven } from './payoff-schedule';

const MONTHS_PER_YEAR = 12;

interface LoanScheduleSnapshotInput {
  /** Original lender-issued principal in the loan's currency. */
  originalPrincipal: number;
  /** APR as a percentage, e.g. 6 for 6%. */
  interestRate: number;
  /** New contractual term in months. */
  termMonths: number;
  /** Contractual origination date. */
  startDate: Date;
  /** Date at which the recalculated balance is asserted. */
  asOfDate: Date;
}

export interface LoanScheduleSnapshot {
  /** Scheduled outstanding balance in the loan's currency. */
  outstandingBalance: number;
  /** Contractual end date derived from the start date and term. */
  endDate: Date;
}

/** Contractual end date, or null when the loan has no defined term. */
export function getLoanEndDate({ startDate, termMonths }: { startDate: Date; termMonths: number | null }): Date | null {
  return termMonths === null ? null : addMonths(startDate, termMonths);
}

/**
 * Recalculates a loan snapshot from its original amortization schedule. The
 * schedule uses the new term to derive the fixed payment, accrues only the
 * elapsed calendar months, and rounds each monthly interest amount to cents.
 */
export function computeLoanScheduleSnapshot({
  originalPrincipal,
  interestRate,
  termMonths,
  startDate,
  asOfDate,
}: LoanScheduleSnapshotInput): LoanScheduleSnapshot | null {
  if (
    !Number.isFinite(originalPrincipal) ||
    originalPrincipal <= 0 ||
    !Number.isFinite(interestRate) ||
    interestRate < 0 ||
    !Number.isFinite(termMonths) ||
    !Number.isInteger(termMonths) ||
    termMonths <= 0
  ) {
    return null;
  }

  const principalCents = Math.round(originalPrincipal * 100);
  const monthlyRate = interestRate / 100 / MONTHS_PER_YEAR;
  const scheduledPaymentCents =
    interestRate === 0
      ? Math.round(principalCents / termMonths)
      : Math.round((principalCents * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths)));
  const elapsedMonths = Math.max(differenceInCalendarMonths(asOfDate, startDate), 0);
  const accruedMonths = Math.min(elapsedMonths, termMonths);

  let outstandingCents = principalCents;
  for (let month = 0; month < accruedMonths && outstandingCents > 0; month += 1) {
    const interestCents = roundHalfToEven(outstandingCents * monthlyRate);
    outstandingCents = Math.max(0, outstandingCents + interestCents - scheduledPaymentCents);
  }
  if (elapsedMonths >= termMonths) outstandingCents = 0;

  const endDate = getLoanEndDate({ startDate, termMonths });
  if (endDate === null) return null;

  return {
    outstandingBalance: outstandingCents / 100,
    endDate,
  };
}
