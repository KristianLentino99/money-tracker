import { QueryInterface, Transaction } from 'sequelize';

/**
 * This fork dropped the legacy Budgets/BudgetCategories/BudgetTransactions tables
 * (see 20260825100000-remove-legacy-budgets.ts) before upstream built real capability
 * on top of them (Lines, Smart Tracking suggestions, Duplicate) and, later, renamed them
 * to Trackers. Upstream's own migrations from here on (20261017000000-tracker-lines.ts
 * onward) assume these tables exist in their pre-rename shape. Recreate them empty, in
 * the exact shape upstream's chain expects (dumped from a clean run of upstream's
 * migrations through 20261015000000-net-amount-for-cash-in-investment-transactions.ts),
 * so that chain can run unmodified. No data to restore: no fork user ever had rows here
 * between the drop and this migration.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const exists = await queryInterface.tableExists('Budgets');
    if (exists) return;

    await queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const run = (sql: string) => queryInterface.sequelize.query(sql, { transaction });

      await run(`CREATE TYPE "enum_Budgets_status" AS ENUM ('active', 'closed', 'archived');`);
      await run(`CREATE TYPE "enum_Budgets_type" AS ENUM ('manual', 'category');`);

      await run(`
        CREATE TABLE "Budgets" (
          "id" uuid DEFAULT gen_random_uuid() NOT NULL,
          "name" character varying(255) NOT NULL,
          "status" "enum_Budgets_status" DEFAULT 'active'::"enum_Budgets_status" NOT NULL,
          "startDate" timestamp with time zone,
          "endDate" timestamp with time zone,
          "autoInclude" boolean DEFAULT false,
          "limitAmount" bigint DEFAULT 0,
          "userId" integer NOT NULL,
          "type" "enum_Budgets_type" DEFAULT 'manual'::"enum_Budgets_type" NOT NULL,
          CONSTRAINT "Budgets_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "Budgets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON UPDATE CASCADE ON DELETE CASCADE
        );
      `);
      await run(`CREATE INDEX "budgets_type_idx" ON "Budgets" USING btree ("type");`);

      await run(`
        CREATE TABLE "BudgetCategories" (
          "budgetId" uuid NOT NULL,
          "categoryId" uuid NOT NULL,
          CONSTRAINT "BudgetCategories_pkey" PRIMARY KEY ("budgetId", "categoryId"),
          CONSTRAINT "BudgetCategories_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budgets"("id") ON UPDATE CASCADE ON DELETE CASCADE,
          CONSTRAINT "BudgetCategories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Categories"("id") ON UPDATE CASCADE ON DELETE CASCADE
        );
      `);

      await run(`
        CREATE TABLE "BudgetTransactions" (
          "budgetId" uuid NOT NULL,
          "transactionId" uuid NOT NULL,
          "metadata" jsonb,
          CONSTRAINT "BudgetTransactions_pkey" PRIMARY KEY ("budgetId", "transactionId"),
          CONSTRAINT "BudgetTransactions_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budgets"("id") ON UPDATE CASCADE ON DELETE CASCADE,
          CONSTRAINT "BudgetTransactions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transactions"("id") ON UPDATE CASCADE ON DELETE CASCADE
        );
      `);
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const run = (sql: string) => queryInterface.sequelize.query(sql, { transaction });
      await run(`DROP TABLE IF EXISTS "BudgetTransactions";`);
      await run(`DROP TABLE IF EXISTS "BudgetCategories";`);
      await run(`DROP TABLE IF EXISTS "Budgets";`);
      await run(`DROP TYPE IF EXISTS "enum_Budgets_type";`);
      await run(`DROP TYPE IF EXISTS "enum_Budgets_status";`);
    });
  },
};
