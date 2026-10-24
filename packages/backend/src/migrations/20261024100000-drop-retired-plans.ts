import { QueryInterface, Transaction } from 'sequelize';

const PLAN_TABLES = [
  'PlanAllocationEvents',
  'PlanAssignments',
  'PlanPeriods',
  'PlanCategoryTargets',
  'PlanAccountMemberships',
  'PlanCategoryMemberships',
  'Plans',
];

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      for (const table of PLAN_TABLES) {
        if (await queryInterface.tableExists(table)) {
          await queryInterface.dropTable(table, { transaction });
        }
      }
    });
  },

  down: async (): Promise<void> => {
    throw new Error('Dropping the retired Plans tables is irreversible because table data is deleted.');
  },
};
