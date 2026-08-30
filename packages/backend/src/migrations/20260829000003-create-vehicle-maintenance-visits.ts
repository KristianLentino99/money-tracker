import { DataTypes, QueryInterface, Transaction } from 'sequelize';

const VISITS_TABLE_NAME = 'VehicleMaintenanceVisits';
const ACTIVITIES_TABLE_NAME = 'VehicleMaintenanceVisitActivities';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction: Transaction = await queryInterface.sequelize.transaction();

    try {
      if (!(await queryInterface.tableExists(VISITS_TABLE_NAME, { transaction }))) {
        await queryInterface.createTable(
          VISITS_TABLE_NAME,
          {
            id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
            vehicleId: {
              type: DataTypes.UUID,
              allowNull: false,
              references: { model: 'Vehicles', key: 'id' },
              onUpdate: 'CASCADE',
              onDelete: 'CASCADE',
            },
            serviceDate: { type: DataTypes.DATEONLY, allowNull: false },
            odometerMeters: { type: DataTypes.BIGINT, allowNull: true },
            notes: { type: DataTypes.TEXT, allowNull: true },
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
            WHERE conname = 'vehicle_maintenance_visits_odometer_check'
              AND conrelid = '"${VISITS_TABLE_NAME}"'::regclass
          ) THEN
            ALTER TABLE "${VISITS_TABLE_NAME}" ADD CONSTRAINT "vehicle_maintenance_visits_odometer_check"
              CHECK ("odometerMeters" IS NULL OR "odometerMeters" >= 0);
          END IF;
        END $$;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS "vehicle_maintenance_visits_vehicle_date_idx" ON "${VISITS_TABLE_NAME}" ("vehicleId", "serviceDate")`,
        { transaction },
      );

      if (!(await queryInterface.tableExists(ACTIVITIES_TABLE_NAME, { transaction }))) {
        await queryInterface.createTable(
          ACTIVITIES_TABLE_NAME,
          {
            id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
            visitId: {
              type: DataTypes.UUID,
              allowNull: false,
              references: { model: VISITS_TABLE_NAME, key: 'id' },
              onUpdate: 'CASCADE',
              onDelete: 'CASCADE',
            },
            activityId: {
              type: DataTypes.UUID,
              allowNull: true,
              references: { model: 'VehicleMaintenanceActivities', key: 'id' },
              onUpdate: 'CASCADE',
              onDelete: 'SET NULL',
            },
            planId: {
              type: DataTypes.UUID,
              allowNull: true,
              references: { model: 'VehicleMaintenancePlans', key: 'id' },
              onUpdate: 'CASCADE',
              onDelete: 'SET NULL',
            },
            labelSnapshot: { type: DataTypes.STRING(100), allowNull: false },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          },
          { transaction },
        );
      }

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS "vehicle_maintenance_visit_activities_visit_idx" ON "${ACTIVITIES_TABLE_NAME}" ("visitId")`,
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
      if (await queryInterface.tableExists(ACTIVITIES_TABLE_NAME, { transaction })) {
        await queryInterface.dropTable(ACTIVITIES_TABLE_NAME, { transaction });
      }
      if (await queryInterface.tableExists(VISITS_TABLE_NAME, { transaction })) {
        await queryInterface.dropTable(VISITS_TABLE_NAME, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
