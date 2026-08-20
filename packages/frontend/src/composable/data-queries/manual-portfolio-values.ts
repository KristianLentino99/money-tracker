import {
  createManualPortfolioTransaction,
  createManualPortfolioValuation,
  deleteManualPortfolioTransaction,
  deleteManualPortfolioValuation,
  executeManualPortfolioImport,
  extractManualPortfolioImport,
  getManualPortfolioValues,
  importManualPortfolioJson,
  updateManualPortfolioTransaction,
  updateManualPortfolioValuation,
} from '@/api/portfolios';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { type MaybeRefOrGetter, toValue } from 'vue';

const invalidate = (client: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    client.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.manualPortfolioValues }),
    client.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfolioSummary }),
    client.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.portfoliosList }),
  ]);
export const useManualPortfolioValues = (portfolioId: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: [...VUE_QUERY_CACHE_KEYS.manualPortfolioValues, portfolioId],
    queryFn: () => getManualPortfolioValues({ portfolioId: toValue(portfolioId) }),
    enabled: () => !!toValue(portfolioId),
  });
export const useCreateManualPortfolioTransaction = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: createManualPortfolioTransaction, onSuccess: () => invalidate(client) });
};
export const useCreateManualPortfolioValuation = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: createManualPortfolioValuation, onSuccess: () => invalidate(client) });
};
export const useUpdateManualPortfolioTransaction = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: updateManualPortfolioTransaction, onSuccess: () => invalidate(client) });
};
export const useDeleteManualPortfolioTransaction = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: deleteManualPortfolioTransaction, onSuccess: () => invalidate(client) });
};
export const useUpdateManualPortfolioValuation = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: updateManualPortfolioValuation, onSuccess: () => invalidate(client) });
};
export const useDeleteManualPortfolioValuation = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: deleteManualPortfolioValuation, onSuccess: () => invalidate(client) });
};
export const useExtractManualPortfolioImport = () => useMutation({ mutationFn: extractManualPortfolioImport });
export const useExecuteManualPortfolioImport = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: executeManualPortfolioImport, onSuccess: () => invalidate(client) });
};
export const useImportManualPortfolioJson = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: importManualPortfolioJson, onSuccess: () => invalidate(client) });
};
