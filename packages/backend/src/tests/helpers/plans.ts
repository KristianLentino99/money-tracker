import type { endpointsTypes } from '@bt/shared/types';

import { makeRequest } from './common';

export const createPlan = async <R extends boolean | undefined = undefined>({
  payload,
  raw,
}: {
  payload: endpointsTypes.CreatePlanBody;
  raw?: R;
}) => makeRequest<endpointsTypes.PlanSummaryResponse, R>({ method: 'post', url: '/plans', payload, raw });

export const getPlans = async <R extends boolean | undefined = undefined>({
  raw,
  status,
}: { raw?: R; status?: string } = {}) =>
  makeRequest<endpointsTypes.PlanSummaryResponse[], R>({
    method: 'get',
    url: '/plans',
    payload: status ? { status } : null,
    raw,
  });

export const getPlanView = async <R extends boolean | undefined = undefined>({
  planId,
  periodStart,
  raw,
}: {
  planId: string;
  periodStart: string;
  raw?: R;
}) =>
  makeRequest<endpointsTypes.PlanViewResponse, R>({
    method: 'get',
    url: `/plans/${planId}/view`,
    payload: { periodStart },
    raw,
  });

export const addPlanCategory = async <R extends boolean | undefined = undefined>({
  planId,
  payload,
  raw,
}: {
  planId: string;
  payload: endpointsTypes.AddPlanCategoryBody;
  raw?: R;
}) => makeRequest<null, R>({ method: 'post', url: `/plans/${planId}/categories`, payload, raw });

export const getPlan = async <R extends boolean | undefined = undefined>({
  planId,
  raw,
}: {
  planId: string;
  raw?: R;
}) => makeRequest<endpointsTypes.PlanSummaryResponse, R>({ method: 'get', url: `/plans/${planId}`, raw });

export const updatePlan = async <R extends boolean | undefined = undefined>({
  planId,
  payload,
  raw,
}: {
  planId: string;
  payload: endpointsTypes.UpdatePlanBody;
  raw?: R;
}) => makeRequest<endpointsTypes.PlanSummaryResponse, R>({ method: 'patch', url: `/plans/${planId}`, payload, raw });

export const archivePlan = async <R extends boolean | undefined = undefined>({
  planId,
  archived,
  raw,
}: {
  planId: string;
  archived: boolean;
  raw?: R;
}) =>
  makeRequest<endpointsTypes.PlanSummaryResponse, R>({
    method: 'patch',
    url: `/plans/${planId}/archive`,
    payload: { archived },
    raw,
  });

export const deletePlan = async <R extends boolean | undefined = undefined>({
  planId,
  raw,
}: {
  planId: string;
  raw?: R;
}) => makeRequest<null, R>({ method: 'delete', url: `/plans/${planId}`, raw });

export const assignPlanCategory = async <R extends boolean | undefined = undefined>({
  planId,
  periodStart,
  categoryId,
  payload,
  raw,
}: {
  planId: string;
  periodStart: string;
  categoryId: string;
  payload: endpointsTypes.SetPlanAssignmentBody;
  raw?: R;
}) =>
  makeRequest<endpointsTypes.PlanMutationResponse, R>({
    method: 'put',
    url: `/plans/${planId}/periods/${periodStart}/assignments/${categoryId}`,
    payload,
    raw,
  });

export const movePlanMoney = async <R extends boolean | undefined = undefined>({
  planId,
  periodStart,
  payload,
  raw,
}: {
  planId: string;
  periodStart: string;
  payload: endpointsTypes.MovePlanMoneyBody;
  raw?: R;
}) =>
  makeRequest<endpointsTypes.PlanMutationResponse, R>({
    method: 'post',
    url: `/plans/${planId}/periods/${periodStart}/move`,
    payload,
    raw,
  });

export const bulkAssignPlanCategories = async <R extends boolean | undefined = undefined>({
  planId,
  periodStart,
  payload,
  raw,
}: {
  planId: string;
  periodStart: string;
  payload: endpointsTypes.BulkPlanAssignmentBody;
  raw?: R;
}) =>
  makeRequest<endpointsTypes.PlanMutationResponse, R>({
    method: 'post',
    url: `/plans/${planId}/periods/${periodStart}/assignments/bulk`,
    payload,
    raw,
  });

export const previewPlanAutoAssign = async <R extends boolean | undefined = undefined>({
  planId,
  periodStart,
  raw,
}: {
  planId: string;
  periodStart: string;
  raw?: R;
}) =>
  makeRequest<unknown, R>({ method: 'post', url: `/plans/${planId}/periods/${periodStart}/auto-assign/preview`, raw });

export const autoAssignPlan = async <R extends boolean | undefined = undefined>({
  planId,
  periodStart,
  payload,
  raw,
}: {
  planId: string;
  periodStart: string;
  payload: endpointsTypes.PlanMutationBody;
  raw?: R;
}) =>
  makeRequest<endpointsTypes.PlanMutationResponse, R>({
    method: 'post',
    url: `/plans/${planId}/periods/${periodStart}/auto-assign`,
    payload,
    raw,
  });

export const undoPlanAllocation = async <R extends boolean | undefined = undefined>({
  planId,
  periodStart,
  payload,
  raw,
}: {
  planId: string;
  periodStart: string;
  payload: endpointsTypes.PlanUndoBody;
  raw?: R;
}) =>
  makeRequest<endpointsTypes.PlanMutationResponse, R>({
    method: 'post',
    url: `/plans/${planId}/periods/${periodStart}/undo`,
    payload,
    raw,
  });
