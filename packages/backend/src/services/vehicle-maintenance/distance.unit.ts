import { describe, expect, it } from '@jest/globals';

import { DistanceOutOfRangeError, POSTGRES_BIGINT_MAX, distanceToMeters, metersToDistance } from './distance';

describe('vehicle maintenance distance conversion', () => {
  it('converts preferred km and mi values to canonical metres and back without unit-dependent storage', () => {
    expect(distanceToMeters({ value: 1_000, unit: 'km' })).toBe(1_000_000);
    expect(distanceToMeters({ value: 1_000, unit: 'mi' })).toBe(1_609_344);

    expect(metersToDistance({ meters: 1_609_344, unit: 'km' })).toBe(1_609.344);
    expect(metersToDistance({ meters: 1_609_344, unit: 'mi' })).toBe(1_000);
  });

  it('rejects values that cannot be represented safely in the BIGINT distance columns', () => {
    expect(() => distanceToMeters({ value: Number.MAX_SAFE_INTEGER, unit: 'km' })).toThrow(DistanceOutOfRangeError);
    expect(() => metersToDistance({ meters: Number.MAX_SAFE_INTEGER + 1, unit: 'km' })).toThrow(
      DistanceOutOfRangeError,
    );
    expect(POSTGRES_BIGINT_MAX).toBe(9_223_372_036_854_775_807n);
  });
});
