import { DataTypes, QueryInterface } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn('InvestmentTransactions', 'portfolioTransferId', {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
      references: {
        model: 'PortfolioTransfers',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    await queryInterface.addIndex('InvestmentTransactions', ['portfolioTransferId'], {
      name: 'investment_transactions_portfolio_transfer_id_idx',
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeIndex('InvestmentTransactions', 'investment_transactions_portfolio_transfer_id_idx');
    await queryInterface.removeColumn('InvestmentTransactions', 'portfolioTransferId');
  },
};
