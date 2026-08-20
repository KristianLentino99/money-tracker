import { DataTypes, QueryInterface, Transaction } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn(
        'Portfolios',
        'isManualTracking',
        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        { transaction: t },
      );
      await queryInterface.createTable(
        'ManualPortfolioTransactions',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          portfolioId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Portfolios', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          category: {
            type: DataTypes.ENUM('contribution', 'withdrawal', 'fee', 'tax', 'other_income', 'distribution'),
            allowNull: false,
          },
          amount: { type: DataTypes.DECIMAL(20, 10), allowNull: false },
          date: { type: DataTypes.DATEONLY, allowNull: false },
          note: { type: DataTypes.TEXT, allowNull: true },
          source: { type: DataTypes.STRING(64), allowNull: true },
          createdAt: { type: DataTypes.DATE, allowNull: false },
          updatedAt: { type: DataTypes.DATE, allowNull: false },
        },
        { transaction: t },
      );
      await queryInterface.createTable(
        'ManualPortfolioValuations',
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          portfolioId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'Portfolios', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          value: { type: DataTypes.DECIMAL(20, 10), allowNull: false },
          date: { type: DataTypes.DATEONLY, allowNull: false },
          note: { type: DataTypes.TEXT, allowNull: true },
          source: { type: DataTypes.STRING(64), allowNull: true },
          createdAt: { type: DataTypes.DATE, allowNull: false },
          updatedAt: { type: DataTypes.DATE, allowNull: false },
        },
        { transaction: t },
      );
      await queryInterface.addIndex('ManualPortfolioTransactions', ['portfolioId', 'date'], { transaction: t });
      await queryInterface.addConstraint('ManualPortfolioValuations', {
        fields: ['portfolioId', 'date'],
        type: 'unique',
        name: 'manual_portfolio_valuations_portfolio_date_unique',
        transaction: t,
      });
      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.dropTable('ManualPortfolioValuations');
    await queryInterface.dropTable('ManualPortfolioTransactions');
    await queryInterface.removeColumn('Portfolios', 'isManualTracking');
  },
};
