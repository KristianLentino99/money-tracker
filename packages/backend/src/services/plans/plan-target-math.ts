import { differenceInCalendarMonths, parseISO, startOfMonth } from 'date-fns';

export interface PlanTargetMathInput {
  targetAmountCents: number;
  dueDate: string;
  periodStart: string;
  availableCents: number;
  assignedCents: number;
}

export interface PlanTargetMathResult {
  savedAmountCents: number;
  remainingCents: number;
  monthlyAmountCents: number;
  progressPercent: number;
  isOnTrack: boolean;
}

const monthsRemaining = ({ periodStart, dueDate }: Pick<PlanTargetMathInput, 'periodStart' | 'dueDate'>) =>
  Math.max(1, differenceInCalendarMonths(startOfMonth(parseISO(dueDate)), startOfMonth(parseISO(periodStart))));

export const calculatePlanTarget = (input: PlanTargetMathInput): PlanTargetMathResult => {
  const savedAmountCents = Math.max(0, input.availableCents);
  const remainingCents = Math.max(0, input.targetAmountCents - input.availableCents);
  const months = monthsRemaining(input);
  const monthlyAmountCents = Math.ceil(remainingCents / months);
  const progressPercent = Math.min(100, Math.max(0, (savedAmountCents / input.targetAmountCents) * 100));

  return {
    savedAmountCents,
    remainingCents,
    monthlyAmountCents,
    progressPercent,
    isOnTrack: savedAmountCents >= input.targetAmountCents || input.assignedCents >= monthlyAmountCents,
  };
};
