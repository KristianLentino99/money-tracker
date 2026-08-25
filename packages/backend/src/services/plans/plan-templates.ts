const PLAN_TEMPLATES = {
  starter: {
    id: 'starter',
    name: 'Starter plan',
  },
} as const;

type PlanTemplateId = keyof typeof PLAN_TEMPLATES;

export const isPlanTemplateId = (value: string): value is PlanTemplateId => value in PLAN_TEMPLATES;
