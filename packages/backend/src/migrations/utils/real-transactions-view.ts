export const REAL_TRANSACTIONS_VIEW = 'real_transactions';

export const createLegacyRealTransactionsViewSql = `CREATE OR REPLACE VIEW ${REAL_TRANSACTIONS_VIEW} AS SELECT * FROM "Transactions" WHERE "isPlanned" = false;`;

export const createRealTransactionsViewSql = `CREATE OR REPLACE VIEW ${REAL_TRANSACTIONS_VIEW} AS SELECT * FROM "Transactions" WHERE "isForecastOnly" = false;`;

export const dropRealTransactionsViewSql = `DROP VIEW IF EXISTS ${REAL_TRANSACTIONS_VIEW};`;
