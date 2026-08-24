import type { CategoryModel, endpointsTypes } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import {
  buildExpenseStructureBreakdown,
  formatExpenseStructureShare,
  getExpenseStructureBreakdownCategoryIds,
  getImmediateChildCategoryIds,
  resolveExpenseStructureClick,
} from './expense-structure-breakdown';

const category = ({ id, parentId = null }: { id: string; parentId?: string | null }) =>
  ({ id, parentId }) as Pick<CategoryModel, 'id' | 'parentId'>;

const spending = ({
  name,
  amount,
  color = '#ffffff',
}: {
  name: string;
  amount: number;
  color?: string;
}): endpointsTypes.SpendingStructure => ({ name, amount, color });

describe('formatExpenseStructureShare', () => {
  it('formats a category share as a rounded percentage', () => {
    expect(formatExpenseStructureShare({ amount: 380, totalAmount: 1000 })).toBe('38%');
  });

  it('avoids division by zero when the parent total is empty', () => {
    expect(formatExpenseStructureShare({ amount: 100, totalAmount: 0 })).toBe('0%');
  });
});

describe('getImmediateChildCategoryIds', () => {
  it('returns only direct children', () => {
    expect(
      getImmediateChildCategoryIds({
        categoryId: 'wants',
        categories: [
          category({ id: 'shopping', parentId: 'wants' }),
          category({ id: 'dining', parentId: 'wants' }),
          category({ id: 'restaurants', parentId: 'dining' }),
          category({ id: 'needs', parentId: null }),
        ],
      }),
    ).toEqual(['shopping', 'dining']);
  });
});

describe('getExpenseStructureBreakdownCategoryIds', () => {
  it('requests the selected parent and only its immediate children', () => {
    expect(
      getExpenseStructureBreakdownCategoryIds({
        categoryId: 'wants',
        categories: [
          category({ id: 'shopping', parentId: 'wants' }),
          category({ id: 'restaurants', parentId: 'shopping' }),
          category({ id: 'dining', parentId: 'wants' }),
        ],
      }),
    ).toEqual(['wants', 'shopping', 'dining']);
  });

  it('returns no request categories for a leaf', () => {
    expect(
      getExpenseStructureBreakdownCategoryIds({
        categoryId: 'shopping',
        categories: [category({ id: 'shopping', parentId: 'wants' })],
      }),
    ).toEqual([]);
  });
});

describe('resolveExpenseStructureClick', () => {
  it('drills down when a regular category has children', () => {
    expect(resolveExpenseStructureClick({ categoryId: 'wants', hasChildren: true, isOther: false })).toEqual({
      type: 'drilldown',
      categoryId: 'wants',
    });
  });

  it('opens transactions for a leaf category', () => {
    expect(resolveExpenseStructureClick({ categoryId: 'shopping', hasChildren: false, isOther: false })).toEqual({
      type: 'transactions',
      categoryId: 'shopping',
    });
  });

  it('opens transactions for the direct-parent Other slice', () => {
    expect(resolveExpenseStructureClick({ categoryId: 'wants', hasChildren: true, isOther: true })).toEqual({
      type: 'transactions',
      categoryId: 'wants',
    });
  });
});

describe('buildExpenseStructureBreakdown', () => {
  it('adds direct parent spending as Other and sorts by amount', () => {
    expect(
      buildExpenseStructureBreakdown({
        parentCategoryId: 'wants',
        childCategoryIds: ['shopping', 'dining'],
        spendings: {
          wants: spending({ name: 'Wants', amount: 100, color: '#parent' }),
          shopping: spending({ name: 'Shopping', amount: 250, color: '#shopping' }),
          dining: spending({ name: 'Dining', amount: 400, color: '#dining' }),
        },
        otherLabel: 'Other',
      }),
    ).toEqual([
      { categoryId: 'dining', name: 'Dining', color: '#dining', amount: 400 },
      { categoryId: 'shopping', name: 'Shopping', color: '#shopping', amount: 250 },
      { categoryId: 'wants', name: 'Other', color: '#parent', amount: 100, isOther: true },
    ]);
  });

  it('omits zero and negative categories', () => {
    expect(
      buildExpenseStructureBreakdown({
        parentCategoryId: 'wants',
        childCategoryIds: ['shopping', 'dining', 'travel'],
        spendings: {
          wants: spending({ name: 'Wants', amount: 0 }),
          shopping: spending({ name: 'Shopping', amount: 0 }),
          dining: spending({ name: 'Dining', amount: -10 }),
          travel: spending({ name: 'Travel', amount: 75 }),
        },
        otherLabel: 'Other',
      }),
    ).toEqual([{ categoryId: 'travel', name: 'Travel', color: '#ffffff', amount: 75 }]);
  });

  it('ignores missing child spending rows', () => {
    expect(
      buildExpenseStructureBreakdown({
        parentCategoryId: 'wants',
        childCategoryIds: ['shopping'],
        spendings: {},
        otherLabel: 'Other',
      }),
    ).toEqual([]);
  });
});
