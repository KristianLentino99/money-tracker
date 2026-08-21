import { describe, expect, it } from '@jest/globals';

describe('Plan model registration', () => {
  it('boots the Sequelize model registry with Plan relationships', async () => {
    process.env.APPLICATION_DB_DIALECT ??= 'postgres';
    process.env.APPLICATION_DB_HOST ??= 'localhost';
    process.env.APPLICATION_DB_PORT ??= '5432';
    process.env.APPLICATION_DB_USERNAME ??= 'postgres';
    process.env.APPLICATION_DB_PASSWORD ??= 'postgres';
    process.env.APPLICATION_DB_DATABASE ??= 'plan_model_registration';

    const { connection } = await import('./index');

    expect(connection.sequelize.models.PlanPeriods).toBeDefined();
    expect(connection.sequelize.models.PlanAssignments).toBeDefined();
    expect(connection.sequelize.models.PlanAllocationEvents.getAttributes().createdAt).toBeDefined();
    expect(connection.sequelize.models.Plans.getAttributes().includeHistoricalTransactions).toBeDefined();
  });
});
