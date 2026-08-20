import { DataTypes, QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'Subscriptions',
        'loanAccountId',
        {
          type: DataTypes.UUID,
          allowNull: true,
          references: { model: 'Accounts', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        { transaction },
      );

      await queryInterface.addIndex('Subscriptions', ['loanAccountId'], {
        name: 'subscriptions_loan_account_id_idx',
        transaction,
      });

      await queryInterface.sequelize.query(
        `ALTER TABLE "Subscriptions" ADD CONSTRAINT "chk_subscriptions_loan_installment_expense"
         CHECK (
           "loanAccountId" IS NULL OR
           ("type" = 'installment' AND "transactionType" = 'expense' AND "accountId" IS DISTINCT FROM "loanAccountId")
         );`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction: Transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.sequelize.query(
        'ALTER TABLE "Subscriptions" DROP CONSTRAINT IF EXISTS "chk_subscriptions_loan_installment_expense";',
        { transaction },
      );
      await queryInterface.removeIndex('Subscriptions', 'subscriptions_loan_account_id_idx', { transaction });
      await queryInterface.removeColumn('Subscriptions', 'loanAccountId', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
