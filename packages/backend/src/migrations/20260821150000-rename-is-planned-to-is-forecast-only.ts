import { QueryInterface, Transaction } from 'sequelize';

const OLD_COLUMN = 'isPlanned';
const NEW_COLUMN = 'isForecastOnly';

const hasColumn = async ({ queryInterface, column }: { queryInterface: QueryInterface; column: string }) => {
  const description = await queryInterface.describeTable('Transactions');
  return column in description;
};

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction: Transaction = await queryInterface.sequelize.transaction();
    try {
      if (await hasColumn({ queryInterface, column: OLD_COLUMN })) {
        await queryInterface.renameColumn('Transactions', OLD_COLUMN, NEW_COLUMN, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction: Transaction = await queryInterface.sequelize.transaction();
    try {
      if (await hasColumn({ queryInterface, column: NEW_COLUMN })) {
        await queryInterface.renameColumn('Transactions', NEW_COLUMN, OLD_COLUMN, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
