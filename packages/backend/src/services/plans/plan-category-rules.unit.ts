import { describe, expect, it } from '@jest/globals';

import { isIncomeCategory } from './plan-category-rules';

describe('Plan category rules', () => {
  it('excludes the income category and every descendant from spending Plans', () => {
    const categories = [
      { id: 'income', parentId: null, key: 'income' },
      { id: 'salary', parentId: 'income', key: 'wage-invoices' },
      { id: 'salary-detail', parentId: 'salary', key: null },
      { id: 'groceries', parentId: null, key: 'groceries' },
    ];

    expect(isIncomeCategory({ categoryId: 'income', categories })).toBe(true);
    expect(isIncomeCategory({ categoryId: 'salary', categories })).toBe(true);
    expect(isIncomeCategory({ categoryId: 'salary-detail', categories })).toBe(true);
    expect(isIncomeCategory({ categoryId: 'groceries', categories })).toBe(false);
  });
});
