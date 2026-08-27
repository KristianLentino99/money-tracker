import type { CategoryModel, endpointsTypes } from '@bt/shared/types';

export interface ExpenseStructureChartDataItem {
  categoryId: string;
  name: string;
  color: string;
  amount: number;
  isOther?: boolean;
}

export const formatExpenseStructureShare = ({
  amount,
  totalAmount,
}: {
  amount: number;
  totalAmount: number;
}): string => {
  if (totalAmount <= 0) return '0%';
  return `${Math.round((amount / totalAmount) * 100)}%`;
};

export const getImmediateChildCategoryIds = ({
  categoryId,
  categories,
}: {
  categoryId: string;
  categories: Pick<CategoryModel, 'id' | 'parentId'>[];
}): string[] => categories.filter((category) => category.parentId === categoryId).map((category) => category.id);

export const getExpenseStructureBreakdownCategoryIds = ({
  categoryId,
  categories,
}: {
  categoryId: string;
  categories: Pick<CategoryModel, 'id' | 'parentId'>[];
}): string[] => {
  const childCategoryIds = getImmediateChildCategoryIds({ categoryId, categories });
  return childCategoryIds.length > 0 ? [categoryId, ...childCategoryIds] : [];
};

type ExpenseStructureClickAction =
  | { type: 'drilldown'; categoryId: string }
  | { type: 'transactions'; categoryId: string };

export const resolveExpenseStructureClick = ({
  categoryId,
  hasChildren,
  isOther,
}: {
  categoryId: string;
  hasChildren: boolean;
  isOther: boolean;
}): ExpenseStructureClickAction =>
  hasChildren && !isOther ? { type: 'drilldown', categoryId } : { type: 'transactions', categoryId };

/**
 * Converts selected-category spending into the next drill-down level. The
 * selected parent is returned by the stats endpoint as the direct-parent
 * bucket, so it becomes the synthetic "Other" slice while children retain
 * their own category identity for further drill-down.
 */
export const buildExpenseStructureBreakdown = ({
  parentCategoryId,
  childCategoryIds,
  spendings,
  otherLabel,
}: {
  parentCategoryId: string;
  childCategoryIds: string[];
  spendings: Record<string, endpointsTypes.SpendingStructure>;
  otherLabel: string;
}): ExpenseStructureChartDataItem[] => {
  const spendingsById = new Map(Object.entries(spendings));
  const children: ExpenseStructureChartDataItem[] = childCategoryIds.flatMap((categoryId) => {
    const spending = spendingsById.get(categoryId);
    if (!spending || spending.amount <= 0) return [];

    return [
      {
        categoryId,
        name: spending.name,
        color: spending.color,
        amount: spending.amount,
      },
    ];
  });

  const directParentSpending = spendingsById.get(parentCategoryId);
  if (directParentSpending && directParentSpending.amount > 0) {
    children.push({
      categoryId: parentCategoryId,
      name: otherLabel,
      color: directParentSpending.color,
      amount: directParentSpending.amount,
      isOther: true,
    });
  }

  return children.sort((a, b) => b.amount - a.amount);
};
