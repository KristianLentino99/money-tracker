import { DataTypes, QueryInterface, Transaction } from 'sequelize';

const TABLE_NAME = 'Vehicles';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction: Transaction = await queryInterface.sequelize.transaction();

    try {
      if (await queryInterface.tableExists(TABLE_NAME, { transaction })) {
        const tableDescription = await queryInterface.describeTable(TABLE_NAME);
        const hasLegacyMileage = 'currentMileage' in tableDescription;
        const hasMeterMileage = 'currentMileageMeters' in tableDescription;

        // The multiplication belongs only to the legacy-column path. A rerun sees the
        // canonical column and must leave already-converted values unchanged.
        if (hasLegacyMileage && !hasMeterMileage) {
          await queryInterface.renameColumn(TABLE_NAME, 'currentMileage', 'currentMileageMeters', { transaction });
          await queryInterface.changeColumn(
            TABLE_NAME,
            'currentMileageMeters',
            { type: DataTypes.BIGINT, allowNull: true, comment: 'Canonical odometer value in metres' },
            { transaction },
          );
          await queryInterface.sequelize.query(
            `UPDATE "${TABLE_NAME}" SET "currentMileageMeters" = "currentMileageMeters" * 1000 WHERE "currentMileageMeters" IS NOT NULL`,
            { transaction },
          );
        }
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
        const tableDescription = await queryInterface.describeTable(TABLE_NAME);
        const hasLegacyMileage = 'currentMileage' in tableDescription;
        const hasMeterMileage = 'currentMileageMeters' in tableDescription;

        if (hasMeterMileage && !hasLegacyMileage) {
          await queryInterface.sequelize.query(
            `UPDATE "${TABLE_NAME}" SET "currentMileageMeters" = ROUND("currentMileageMeters" / 1000.0) WHERE "currentMileageMeters" IS NOT NULL`,
            { transaction },
          );
          await queryInterface.changeColumn(
            TABLE_NAME,
            'currentMileageMeters',
            { type: DataTypes.INTEGER, allowNull: true, comment: 'Optional metadata in P1; no math impact' },
            { transaction },
          );
          await queryInterface.renameColumn(TABLE_NAME, 'currentMileageMeters', 'currentMileage', { transaction });
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
