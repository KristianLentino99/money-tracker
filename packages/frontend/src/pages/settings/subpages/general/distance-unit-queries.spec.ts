import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { describe, expect, it, vi } from 'vitest';

import { invalidateDistanceUnitQueries } from './distance-unit-queries';

describe('invalidateDistanceUnitQueries', () => {
  it('invalidates vehicle maintenance list and detail queries with the vehicle caches', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await invalidateDistanceUnitQueries({ queryClient: { invalidateQueries } });

    expect(invalidateQueries).toHaveBeenCalledTimes(3);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: VUE_QUERY_CACHE_KEYS.vehiclesList });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleDetail });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: VUE_QUERY_CACHE_KEYS.vehicleMaintenance });
  });
});
