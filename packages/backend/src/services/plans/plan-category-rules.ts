const INCOME_CATEGORY_KEY = 'income';

type CategoryAncestryNode = {
  id: string;
  parentId: string | null;
  key: string | null;
};

export const isIncomeCategory = ({
  categoryId,
  categories,
}: {
  categoryId: string;
  categories: CategoryAncestryNode[];
}) => {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const visited = new Set<string>();
  let current = categoriesById.get(categoryId);

  while (current && !visited.has(current.id)) {
    if (current.key === INCOME_CATEGORY_KEY) return true;
    visited.add(current.id);
    current = current.parentId ? categoriesById.get(current.parentId) : undefined;
  }

  return false;
};
