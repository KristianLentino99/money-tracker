import { DataTypes, QueryInterface, Transaction } from 'sequelize';

const TABLE_NAME = 'VehicleMaintenancePlans';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction: Transaction = await queryInterface.sequelize.transaction();

    try {
      if (!(await queryInterface.tableExists(TABLE_NAME, { transaction }))) {
        await queryInterface.createTable(
          TABLE_NAME,
          {
            id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
            vehicleId: {
              type: DataTypes.UUID,
              allowNull: false,
              references: { model: 'Vehicles', key: 'id' },
              onUpdate: 'CASCADE',
              onDelete: 'CASCADE',
            },
            activityId: {
              type: DataTypes.UUID,
              allowNull: false,
              references: { model: 'VehicleMaintenanceActivities', key: 'id' },
              onUpdate: 'CASCADE',
              onDelete: 'RESTRICT',
            },
            nextDueDate: { type: DataTypes.DATEONLY, allowNull: true },
            nextDueDistanceMeters: { type: DataTypes.BIGINT, allowNull: true },
            leadDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
            leadDistanceMeters: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 1_000_000 },
            archivedAt: { type: DataTypes.DATE, allowNull: true },
            upcomingNotifiedAt: { type: DataTypes.DATE, allowNull: true },
            overdueNotifiedAt: { type: DataTypes.DATE, allowNull: true },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          },
          { transaction },
        );
      }

      await queryInterface.sequelize.query(
        `DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'vehicle_maintenance_plans_due_check'
              AND conrelid = '"${TABLE_NAME}"'::regclass
          ) THEN
            ALTER TABLE "${TABLE_NAME}" ADD CONSTRAINT "vehicle_maintenance_plans_due_check"
              CHECK ("nextDueDate" IS NOT NULL OR "nextDueDistanceMeters" IS NOT NULL);
          END IF;
        END $$;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'vehicle_maintenance_plans_lead_days_check'
              AND conrelid = '"${TABLE_NAME}"'::regclass
          ) THEN
            ALTER TABLE "${TABLE_NAME}" ADD CONSTRAINT "vehicle_maintenance_plans_lead_days_check"
              CHECK ("leadDays" >= 0);
          END IF;
        END $$;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'vehicle_maintenance_plans_lead_distance_check'
              AND conrelid = '"${TABLE_NAME}"'::regclass
          ) THEN
            ALTER TABLE "${TABLE_NAME}" ADD CONSTRAINT "vehicle_maintenance_plans_lead_distance_check"
              CHECK ("leadDistanceMeters" >= 0);
          END IF;
        END $$;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'vehicle_maintenance_plans_distance_check'
              AND conrelid = '"${TABLE_NAME}"'::regclass
          ) THEN
            ALTER TABLE "${TABLE_NAME}" ADD CONSTRAINT "vehicle_maintenance_plans_distance_check"
              CHECK ("nextDueDistanceMeters" IS NULL OR "nextDueDistanceMeters" >= 0);
          END IF;
        END $$;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS "vehicle_maintenance_plans_vehicle_archived_idx" ON "${TABLE_NAME}" ("vehicleId", "archivedAt")`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_maintenance_plans_active_vehicle_activity_idx"
         ON "${TABLE_NAME}" ("vehicleId", "activityId")
         WHERE "archivedAt" IS NULL`,
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
