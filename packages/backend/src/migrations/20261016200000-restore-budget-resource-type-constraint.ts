import { QueryInterface, Transaction } from 'sequelize';

/**
 * This fork's 20260825100000-remove-legacy-budgets.ts rewrote the polymorphic
 * share-table `resourceType` shape CHECK constraints to admit `'plan'` instead of
 * `'budget'`, matching its now-retired Plans feature. Plans never shipped a
 * successor to this constraint before being removed, and the fork's Budget feature
 * (restored by 20261016000000-restore-legacy-budget-tables.ts) is active again, so
 * the constraint must admit `'budget'` once more. Shape matches upstream's original
 * 20260520000002-extend-resource-types-budget.ts verbatim.
 *
 * That fork migration also re-added a `chk_*_resource_type` IN-list CHECK alongside
 * the shape CHECK — upstream deprecated that redundant constraint style back in
 * 20260514000000-extend-resource-types-household.ts in favor of the shape CHECK
 * alone. Drop it here too so this fork's constraint set matches upstream's current
 * design exactly, not a superset of it.
 */
const RESOURCE_TYPE_SHAPE_WITH_BUDGET = `
  ("resourceType" = 'account' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  OR
  ("resourceType" = 'household' AND "resourceId" ~ '^[0-9]+$' AND "resourceId" = "ownerUserId"::text)
  OR
  ("resourceType" = 'budget' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
`;

const RESOURCE_TYPE_SHAPE_WITH_PLAN = `
  ("resourceType" = 'account' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  OR
  ("resourceType" = 'household' AND "resourceId" ~ '^[0-9]+$' AND "resourceId" = "ownerUserId"::text)
  OR
  ("resourceType" = 'plan' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
`;

const swapShape = async ({
  queryInterface,
  transaction,
  shape,
}: {
  queryInterface: QueryInterface;
  transaction: Transaction;
  shape: string;
}): Promise<void> => {
  await queryInterface.sequelize.query(
    `ALTER TABLE "ResourceShares" DROP CONSTRAINT IF EXISTS "chk_resource_shares_type_shape";`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "ShareInvitations" DROP CONSTRAINT IF EXISTS "chk_share_invitations_type_shape";`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_type_shape" CHECK (${shape});`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_type_shape" CHECK (${shape});`,
    { transaction },
  );
};

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`DELETE FROM "ResourceShares" WHERE "resourceType" = 'plan';`, {
        transaction,
      });
      await queryInterface.sequelize.query(`DELETE FROM "ShareInvitations" WHERE "resourceType" = 'plan';`, {
        transaction,
      });
      await swapShape({ queryInterface, transaction, shape: RESOURCE_TYPE_SHAPE_WITH_BUDGET });
      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" DROP CONSTRAINT IF EXISTS "chk_resource_shares_resource_type";`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" DROP CONSTRAINT IF EXISTS "chk_share_invitations_resource_type";`,
        { transaction },
      );
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`DELETE FROM "ResourceShares" WHERE "resourceType" = 'budget';`, {
        transaction,
      });
      await queryInterface.sequelize.query(`DELETE FROM "ShareInvitations" WHERE "resourceType" = 'budget';`, {
        transaction,
      });
      await swapShape({ queryInterface, transaction, shape: RESOURCE_TYPE_SHAPE_WITH_PLAN });
      await queryInterface.sequelize.query(
        `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_resource_type"
         CHECK ("resourceType" IN ('account', 'household', 'plan'));`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_resource_type"
         CHECK ("resourceType" IN ('account', 'household', 'plan'));`,
        { transaction },
      );
    });
  },
};
