import { DataTypes, QueryInterface, Transaction } from 'sequelize';

const RESOURCE_TYPE_SHAPE_WITH_PLAN = `
  ("resourceType" = 'account' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  OR
  ("resourceType" = 'household' AND "resourceId" ~ '^[0-9]+$' AND "resourceId" = "ownerUserId"::text)
  OR
  ("resourceType" = 'budget' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  OR
  ("resourceType" = 'plan' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
`;

const RESOURCE_TYPE_SHAPE_WITHOUT_PLAN = `
  ("resourceType" = 'account' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  OR
  ("resourceType" = 'household' AND "resourceId" ~ '^[0-9]+$' AND "resourceId" = "ownerUserId"::text)
  OR
  ("resourceType" = 'budget' AND "resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
`;

const addPlanResourceConstraints = async ({
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
     CHECK ("resourceType" IN ('account', 'household', 'budget', 'plan'));`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_resource_type"
     CHECK ("resourceType" IN ('account', 'household', 'budget', 'plan'));`,
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

const restorePrePlanResourceConstraints = async ({
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
     CHECK ("resourceType" IN ('account', 'household', 'budget'));`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_resource_type"
     CHECK ("resourceType" IN ('account', 'household', 'budget'));`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "ResourceShares" ADD CONSTRAINT "chk_resource_shares_type_shape"
     CHECK (${RESOURCE_TYPE_SHAPE_WITHOUT_PLAN});`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "ShareInvitations" ADD CONSTRAINT "chk_share_invitations_type_shape"
     CHECK (${RESOURCE_TYPE_SHAPE_WITHOUT_PLAN});`,
    { transaction },
  );
};

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable(
        'Plans',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          ownerUserId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          name: { type: DataTypes.STRING(200), allowNull: false },
          visibility: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'private' },
          status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'active' },
          isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
          baseCurrencyCode: {
            type: DataTypes.STRING(3),
            allowNull: false,
            references: { model: 'Currencies', key: 'code' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          periodStartDay: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
          includeHistoricalTransactions: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
          archivedAt: { type: DataTypes.DATE, allowNull: true },
          createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE "Plans" ADD CONSTRAINT "plans_visibility_check" CHECK ("visibility" IN ('private', 'shared'));`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Plans" ADD CONSTRAINT "plans_status_check" CHECK ("status" IN ('active', 'archived'));`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Plans" ADD CONSTRAINT "plans_period_start_day_check" CHECK ("periodStartDay" BETWEEN 1 AND 31);`,
        { transaction },
      );
      await queryInterface.addIndex('Plans', ['ownerUserId', 'status'], {
        name: 'plans_owner_status_idx',
        transaction,
      });
      await queryInterface.addIndex('Plans', ['ownerUserId'], {
        name: 'plans_owner_idx',
        unique: true,
        where: { isDefault: true, status: 'active' },
        transaction,
      });

      await queryInterface.createTable(
        'PlanCategoryMemberships',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          planId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Plans', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          categoryId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'Categories', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
          detachedAt: { type: DataTypes.DATE, allowNull: true },
          categoryNameSnapshot: { type: DataTypes.STRING, allowNull: false },
          categoryGroupNameSnapshot: { type: DataTypes.STRING, allowNull: true },
          createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        { transaction },
      );
      await queryInterface.addIndex('PlanCategoryMemberships', ['planId', 'categoryId'], {
        name: 'plan_categories_plan_category_idx',
        unique: true,
        where: { active: true },
        transaction,
      });
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "plan_categories_active_category_uq"
         ON "PlanCategoryMemberships" ("categoryId")
         WHERE "active" = true AND "categoryId" IS NOT NULL;`,
        { transaction },
      );
      await queryInterface.addIndex('PlanCategoryMemberships', ['planId', 'active'], {
        name: 'plan_categories_plan_active_idx',
        transaction,
      });

      await queryInterface.createTable(
        'PlanCategoryTargets',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          planId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Plans', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          categoryIdentity: { type: DataTypes.UUID, allowNull: false },
          categoryId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'Categories', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          categoryNameSnapshot: { type: DataTypes.STRING, allowNull: false },
          targetAmountCents: { type: DataTypes.BIGINT, allowNull: false },
          dueDate: { type: DataTypes.DATEONLY, allowNull: false },
          createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "PlanCategoryTargets" ADD CONSTRAINT "plan_category_targets_amount_check" CHECK ("targetAmountCents" > 0);`,
        { transaction },
      );
      await queryInterface.addConstraint('PlanCategoryTargets', {
        fields: ['planId', 'categoryIdentity'],
        type: 'unique',
        name: 'plan_category_targets_plan_category_uq',
        transaction,
      });
      await queryInterface.addIndex('PlanCategoryTargets', ['planId'], {
        name: 'plan_category_targets_plan_idx',
        transaction,
      });

      await queryInterface.createTable(
        'PlanAccountMemberships',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          planId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Plans', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          accountId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'Accounts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
          detachedAt: { type: DataTypes.DATE, allowNull: true },
          accountNameSnapshot: { type: DataTypes.STRING, allowNull: false },
          currencyCodeSnapshot: { type: DataTypes.STRING(3), allowNull: true },
          createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        { transaction },
      );
      await queryInterface.addIndex('PlanAccountMemberships', ['planId', 'accountId'], {
        name: 'plan_accounts_plan_account_idx',
        unique: true,
        where: { active: true },
        transaction,
      });
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "plan_accounts_active_account_uq"
         ON "PlanAccountMemberships" ("accountId")
         WHERE "active" = true AND "accountId" IS NOT NULL;`,
        { transaction },
      );
      await queryInterface.addIndex('PlanAccountMemberships', ['planId', 'active'], {
        name: 'plan_accounts_plan_active_idx',
        transaction,
      });

      await queryInterface.createTable(
        'PlanPeriods',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          planId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Plans', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          periodStart: { type: DataTypes.DATEONLY, allowNull: false },
          revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
          createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        { transaction },
      );
      await queryInterface.addConstraint('PlanPeriods', {
        fields: ['planId', 'periodStart'],
        type: 'unique',
        name: 'plan_periods_plan_period_uq',
        transaction,
      });
      await queryInterface.addIndex('PlanPeriods', ['planId', 'periodStart'], {
        name: 'plan_periods_plan_start_idx',
        transaction,
      });

      await queryInterface.createTable(
        'PlanAssignments',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          planId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Plans', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          periodStart: { type: DataTypes.DATEONLY, allowNull: false },
          categoryIdentity: { type: DataTypes.UUID, allowNull: false },
          categoryId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: 'Categories', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          categoryNameSnapshot: { type: DataTypes.STRING, allowNull: false },
          assignedCents: { type: DataTypes.BIGINT, allowNull: false },
          createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "PlanAssignments" ADD CONSTRAINT "plan_assignments_nonzero_check" CHECK ("assignedCents" <> 0);`,
        { transaction },
      );
      await queryInterface.addConstraint('PlanAssignments', {
        fields: ['planId', 'periodStart', 'categoryIdentity'],
        type: 'unique',
        name: 'plan_assignments_plan_period_category_uq',
        transaction,
      });
      await queryInterface.addIndex('PlanAssignments', ['planId', 'periodStart'], {
        name: 'plan_assignments_plan_period_idx',
        transaction,
      });
      await queryInterface.addIndex('PlanAssignments', ['categoryId'], {
        name: 'plan_assignments_category_idx',
        transaction,
      });

      await queryInterface.createTable(
        'PlanAllocationEvents',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          planId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Plans', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          periodStart: { type: DataTypes.DATEONLY, allowNull: false },
          actorUserId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          action: { type: DataTypes.STRING(32), allowNull: false },
          requestId: { type: DataTypes.UUID, allowNull: false },
          payloadFingerprint: { type: DataTypes.STRING(64), allowNull: false },
          before: { type: DataTypes.JSONB, allowNull: false },
          after: { type: DataTypes.JSONB, allowNull: false },
          expectedRevision: { type: DataTypes.INTEGER, allowNull: false },
          resultRevision: { type: DataTypes.INTEGER, allowNull: false },
          createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        { transaction },
      );
      await queryInterface.addConstraint('PlanAllocationEvents', {
        fields: ['planId', 'actorUserId', 'requestId'],
        type: 'unique',
        name: 'plan_allocation_events_request_uq',
        transaction,
      });
      await queryInterface.addIndex('PlanAllocationEvents', ['planId', 'periodStart', 'createdAt'], {
        name: 'plan_allocation_events_plan_period_created_idx',
        transaction,
      });

      await addPlanResourceConstraints({ queryInterface, transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.sequelize.query(`DELETE FROM "ResourceShares" WHERE "resourceType" = 'plan';`, {
        transaction,
      });
      await queryInterface.sequelize.query(`DELETE FROM "ShareInvitations" WHERE "resourceType" = 'plan';`, {
        transaction,
      });
      await restorePrePlanResourceConstraints({ queryInterface, transaction });
      await queryInterface.dropTable('PlanAllocationEvents', { transaction });
      await queryInterface.dropTable('PlanAssignments', { transaction });
      await queryInterface.dropTable('PlanPeriods', { transaction });
      await queryInterface.dropTable('PlanCategoryTargets', { transaction });
      await queryInterface.dropTable('PlanAccountMemberships', { transaction });
      await queryInterface.dropTable('PlanCategoryMemberships', { transaction });
      await queryInterface.dropTable('Plans', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
