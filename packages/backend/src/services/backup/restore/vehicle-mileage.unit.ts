import { describe, expect, it } from '@jest/globals';

import { legacyMileageToMeters } from './vehicle-mileage';

describe('legacyMileageToMeters', () => {
  it('converts numeric and raw BIGINT string kilometre values to metres', () => {
    expect(legacyMileageToMeters({ value: 1_234 })).toBe(1_234_000);
    expect(legacyMileageToMeters({ value: '1234' })).toBe(1_234_000);
  });

  it('does not create a canonical value from malformed legacy data', () => {
    expect(legacyMileageToMeters({ value: '' })).toBeUndefined();
    expect(legacyMileageToMeters({ value: 'not-a-mileage' })).toBeUndefined();
    expect(legacyMileageToMeters({ value: -1 })).toBeUndefined();
  });
});
