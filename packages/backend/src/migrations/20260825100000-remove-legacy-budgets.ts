import { QueryInterface, Transaction } from 'sequelize';

const RESOURCE_TYPE_SHAPE_WITH_PLAN = `
  ("resourceType" = 'account' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  OR
  ("resourceType" = 'household' AND "resourceId" ~ '^[0-9]+$' AND "resourceId" = "ownerUserId"::text)
  OR
  ("resourceType" = 'plan' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
`;

const restorePlanResourceConstraints = async ({
  queryInterface,
  transaction,
}: {
  queryInterface: QueryInterface;
  transaction: Transaction;
}) => {
  await queryInterface.sequelize.query(
    `ALTER TABLE "ResourceShares" DROP CONSTRAINT IF EXISTS "chk_resource_shares_resource_type";`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "ShareInvitations" DROP CONSTRAINT IF EXISTS "chk_share_invitations_resource_type";`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "ResourceShares" DROP CONSTRAINT IF EXISTS "chk_resource_shares_type_shape";`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "ShareInvitations" DROP CONSTRAINT IF EXISTS "chk_share_invitations_type_shape";`,
    { transaction },
  );

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
  await queryInterface.sequelize.query(
    `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_type_shape"
     CHECK (${RESOURCE_TYPE_SHAPE_WITH_PLAN});`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_type_shape"
     CHECK (${RESOURCE_TYPE_SHAPE_WITH_PLAN});`,
    { transaction },
  );
};

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.sequelize.query(`DELETE FROM "ResourceShares" WHERE "resourceType" = 'budget';`, {
        transaction,
      });
      await queryInterface.sequelize.query(`DELETE FROM "ShareInvitations" WHERE "resourceType" = 'budget';`, {
        transaction,
      });

      if (await queryInterface.tableExists('Notifications')) {
        await queryInterface.sequelize.query(
          `DELETE FROM "Notifications"
           WHERE "type" IN ('budget_alert', 'share_owner_budget_deleted')
              OR "payload"->>'resourceType' = 'budget'
              OR "payload" ? 'budgetId';`,
          { transaction },
        );
      }

      await restorePlanResourceConstraints({ queryInterface, transaction });

      for (const table of ['BudgetCategories', 'BudgetTransactions', 'Budgets']) {
        if (await queryInterface.tableExists(table)) {
          await queryInterface.dropTable(table, { transaction });
        }
      }

      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Budgets_type";', {
        transaction,
      });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Budgets_status";', {
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (): Promise<void> => {
    throw new Error('Removing legacy budgets is irreversible because the tables and rows are deleted.');
  },
};
