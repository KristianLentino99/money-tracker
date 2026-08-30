import crypto from 'crypto';
import { DataTypes, QueryInterface, QueryTypes, Transaction } from 'sequelize';

const TABLE_NAME = 'VehicleMaintenanceActivities';

const GLOBAL_ACTIVITY_PRESETS = [
  'inspection',
  'scheduled-service',
  'oil-change',
  'tires',
  'brakes',
  'battery',
  'other',
] as const;

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction: Transaction = await queryInterface.sequelize.transaction();

    try {
      if (!(await queryInterface.tableExists(TABLE_NAME, { transaction }))) {
        await queryInterface.createTable(
          TABLE_NAME,
          {
            id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
            userId: {
              type: DataTypes.INTEGER,
              allowNull: true,
              references: { model: 'Users', key: 'id' },
              onUpdate: 'CASCADE',
              onDelete: 'CASCADE',
            },
            systemKey: { type: DataTypes.STRING(50), allowNull: true },
            name: { type: DataTypes.STRING(100), allowNull: true },
            sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1000 },
            archivedAt: { type: DataTypes.DATE, allowNull: true },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          },
          { transaction },
        );
      }

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS "vehicle_maintenance_activities_user_order_idx" ON "${TABLE_NAME}" ("userId", "sortOrder")`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS "vehicle_maintenance_activities_system_key_idx" ON "${TABLE_NAME}" ("systemKey")`,
        { transaction },
      );

      const existingPresets = (await queryInterface.sequelize.query<{ systemKey: string }>(
        `SELECT "systemKey" FROM "${TABLE_NAME}" WHERE "userId" IS NULL AND "systemKey" IS NOT NULL`,
        { transaction, type: QueryTypes.SELECT },
      )) as { systemKey: string }[];
      const existingKeys = new Set(existingPresets.map(({ systemKey }) => systemKey));
      const missingPresets = GLOBAL_ACTIVITY_PRESETS.filter((systemKey) => !existingKeys.has(systemKey));
      if (missingPresets.length > 0) {
        const now = new Date();
        await queryInterface.bulkInsert(
          TABLE_NAME,
          missingPresets.map((systemKey) => ({
            id: crypto.randomUUID(),
            userId: null,
            systemKey,
            name: null,
            sortOrder: GLOBAL_ACTIVITY_PRESETS.indexOf(systemKey) + 1,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          })),
          { transaction },
        );
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
