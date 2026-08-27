import { api } from '@/api/_api';
import { endpointsTypes } from '@bt/shared/types';

export const loadPlans = async ({ status }: { status?: string } = {}): Promise<endpointsTypes.PlanSummaryResponse[]> =>
  api.get('/plans', status ? { status } : undefined);

export const loadPlanView = async ({
  planId,
  periodStart,
}: {
  planId: string;
  periodStart: string;
}): Promise<endpointsTypes.PlanViewResponse> => api.get(`/plans/${planId}/view`, { periodStart });

export const createPlan = async (payload: endpointsTypes.CreatePlanBody): Promise<endpointsTypes.PlanSummaryResponse> =>
  api.post('/plans', payload);

export const deletePlan = async ({ planId }: { planId: string }): Promise<void> => {
  await api.delete(`/plans/${planId}`);
};

export const addPlanCategory = async ({
  planId,
  categoryId,
}: {
  planId: string;
  categoryId: string;
}): Promise<void> => {
  await api.post(`/plans/${planId}/categories`, { categoryId });
};

export const setPlanCategoryTarget = async ({
  planId,
  categoryId,
  payload,
}: {
  planId: string;
  categoryId: string;
  payload: endpointsTypes.SetPlanCategoryTargetBody;
}): Promise<endpointsTypes.PlanCategoryTargetConfig> =>
  api.put(`/plans/${planId}/categories/${categoryId}/target`, payload);

export const deletePlanCategoryTarget = async ({
  planId,
  categoryId,
}: {
  planId: string;
  categoryId: string;
}): Promise<void> => {
  await api.delete(`/plans/${planId}/categories/${categoryId}/target`);
};

export const setPlanAssignment = async ({
  planId,
  periodStart,
  categoryId,
  payload,
}: {
  planId: string;
  periodStart: string;
  categoryId: string;
  payload: endpointsTypes.SetPlanAssignmentBody;
}): Promise<endpointsTypes.PlanMutationResponse> =>
  api.put(`/plans/${planId}/periods/${periodStart}/assignments/${categoryId}`, payload);

export const movePlanMoney = async ({
  planId,
  periodStart,
  payload,
}: {
  planId: string;
  periodStart: string;
  payload: endpointsTypes.MovePlanMoneyBody;
}): Promise<endpointsTypes.PlanMutationResponse> => api.post(`/plans/${planId}/periods/${periodStart}/move`, payload);

export const previewAutoAssign = async ({ planId, periodStart }: { planId: string; periodStart: string }) =>
  api.post(`/plans/${planId}/periods/${periodStart}/auto-assign/preview`, {});

export const autoAssign = async ({
  planId,
  periodStart,
  payload,
}: {
  planId: string;
  periodStart: string;
  payload: endpointsTypes.PlanMutationBody;
}): Promise<endpointsTypes.PlanMutationResponse> =>
  api.post(`/plans/${planId}/periods/${periodStart}/auto-assign`, payload);

export const undoPlanAllocation = async ({
  planId,
  periodStart,
  payload,
}: {
  planId: string;
  periodStart: string;
  payload: endpointsTypes.PlanUndoBody;
}): Promise<endpointsTypes.PlanMutationResponse> => api.post(`/plans/${planId}/periods/${periodStart}/undo`, payload);
