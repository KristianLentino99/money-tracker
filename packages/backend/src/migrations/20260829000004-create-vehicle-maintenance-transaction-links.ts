import { DataTypes, QueryInterface, Transaction } from 'sequelize';

const TABLE_NAME = 'VehicleMaintenanceTransactionLinks';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction: Transaction = await queryInterface.sequelize.transaction();

    try {
      if (!(await queryInterface.tableExists(TABLE_NAME, { transaction }))) {
        await queryInterface.createTable(
          TABLE_NAME,
          {
            id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
            visitId: {
              type: DataTypes.UUID,
              allowNull: false,
              references: { model: 'VehicleMaintenanceVisits', key: 'id' },
              onUpdate: 'CASCADE',
              onDelete: 'CASCADE',
            },
            transactionId: {
              type: DataTypes.UUID,
              allowNull: false,
              references: { model: 'Transactions', key: 'id' },
              onUpdate: 'CASCADE',
              onDelete: 'CASCADE',
            },
            createdByMaintenance: {
              type: DataTypes.BOOLEAN,
              allowNull: false,
              defaultValue: false,
            },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          },
          { transaction },
        );
      }

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS "vehicle_maintenance_transaction_links_visit_idx" ON "${TABLE_NAME}" ("visitId")`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_maintenance_transaction_links_transaction_unique" ON "${TABLE_NAME}" ("transactionId")`,
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
      if (await queryInterface.tableExists(TABLE_NAME, { transaction })) {
        await queryInterface.dropTable(TABLE_NAME, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
