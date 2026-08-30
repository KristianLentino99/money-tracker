import { VUE_QUERY_CACHE_KEYS } from '@/common/const';

type QueryClientLike = {
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => Promise<unknown>;
};

export async function invalidateDistanceUnitQueries({ queryClient }: { queryClient: QueryClientLike }): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehiclesList }),
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleDetail }),
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenance }),
  ]);
}
