import { DataTypes, QueryInterface, QueryTypes, Transaction } from 'sequelize';

const TABLE_NAME = 'PlanCategoryTargets';

const createPlanCategoryTargets = async ({
  queryInterface,
  transaction,
}: {
  queryInterface: QueryInterface;
  transaction: Transaction;
}) => {
  await queryInterface.createTable(
    TABLE_NAME,
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
    `ALTER TABLE "${TABLE_NAME}" ADD CONSTRAINT "plan_category_targets_amount_check" CHECK ("targetAmountCents" > 0);`,
    { transaction },
  );
  await queryInterface.addConstraint(TABLE_NAME, {
    fields: ['planId', 'categoryIdentity'],
    type: 'unique',
    name: 'plan_category_targets_plan_category_uq',
    transaction,
  });
  await queryInterface.addIndex(TABLE_NAME, ['planId'], {
    name: 'plan_category_targets_plan_idx',
    transaction,
  });
};

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const [table] = await queryInterface.sequelize.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.tables
           WHERE table_schema = current_schema()
             AND table_name = '${TABLE_NAME}'
         ) AS "exists";`,
        { transaction, type: QueryTypes.SELECT },
      );

      // The plan creation migration already creates this table on a fresh database.
      // Existing installations may have recorded that migration before the target
      // table was added, so only create it when the schema is missing it entirely.
      if (!table?.exists) {
        await createPlanCategoryTargets({ queryInterface, transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (): Promise<void> => {
    throw new Error(
      `Cannot down-migrate 20260826000000-create-plan-category-targets: ${TABLE_NAME} may be owned by the original plan migration on fresh databases. Reconcile the schema manually if rollback is required.`,
    );
  },
};
