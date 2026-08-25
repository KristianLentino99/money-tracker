import Accounts from '@models/accounts.model';

import { getAccessibleAccountIdsForUser } from './get-accessible-account-ids.service';

/**
 * Returns the distinct users whose categories the caller can see: the caller and
 * owners of accounts shared with the caller.
 */
export const getAccessibleCategoryOwnerIds = async ({ userId }: { userId: number }): Promise<number[]> => {
  const accessibleAccountIds = await getAccessibleAccountIdsForUser({ userId });
  const ownerUserIds = new Set<number>([userId]);

  if (accessibleAccountIds.length) {
    const accountRows = await Accounts.findAll({
      where: { id: accessibleAccountIds },
      attributes: ['userId'],
    });
    for (const row of accountRows) ownerUserIds.add(row.userId);
  }

  return Array.from(ownerUserIds);
};
