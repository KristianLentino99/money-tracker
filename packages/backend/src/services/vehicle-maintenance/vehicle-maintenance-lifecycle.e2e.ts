import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTION_TYPES, VEHICLE_CLASS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { addDays, format } from 'date-fns';

describe('Vehicle maintenance lifecycle', () => {
  it('does not expose or mutate a vehicle maintenance plan or visit across users', async () => {
    const vehicle = await helpers.createVehicle({
      name: 'Private maintenance car',
      currencyCode: global.BASE_CURRENCY.code,
      make: 'Toyota',
      model: 'Corolla',
      year: 2022,
      vehicleClass: VEHICLE_CLASS.sedan,
      purchasePrice: 20_000,
      purchaseDate: '2022-01-01',
      raw: true,
    });
    const activity = (await helpers.getMaintenanceActivities({ raw: true })).find(
      ({ systemKey }) => systemKey === 'scheduled-service',
    )!;
    const plan = await helpers.createMaintenancePlan({
      vehicleId: vehicle.id,
      activityId: activity.id,
      nextDueDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      raw: true,
    });
    const visit = await helpers.createMaintenanceVisit({
      vehicleId: vehicle.id,
      serviceDate: format(new Date(), 'yyyy-MM-dd'),
      activities: [{ activityId: activity.id }],
      raw: true,
    });
    const otherUser = await helpers.provisionSecondUserWithBaseCurrency();

    await helpers.asUser({
      cookies: otherUser.cookies,
      fn: async () => {
        expect((await helpers.getVehicleMaintenance({ vehicleId: vehicle.id })).statusCode).toBe(404);
        expect(
          (
            await helpers.updateMaintenancePlan({
              vehicleId: vehicle.id,
              planId: plan.id,
              archived: true,
            })
          ).statusCode,
        ).toBe(404);
        expect(
          (
            await helpers.updateMaintenanceVisit({
              vehicleId: vehicle.id,
              visitId: visit.id,
              notes: 'unauthorized',
            })
          ).statusCode,
        ).toBe(404);
      },
    });
  });

  it('keeps a visit visible after a shared linked transaction is revoked but redacts that transaction', async () => {
    const currentUser = await helpers.getUserInfo({ raw: true });
    const transactionOwner = await helpers.provisionSecondUserWithBaseCurrency();
    const ownerAccount = await helpers.asUser({
      cookies: transactionOwner.cookies,
      fn: () => helpers.createAccount({ raw: true }),
    });
    const ownerCategory = await helpers.asUser({
      cookies: transactionOwner.cookies,
      fn: () => helpers.addCustomCategory({ name: 'Owner maintenance expense', color: '#FF0000', raw: true }),
    });
    const sharedExpenseResponse = await helpers.asUser({
      cookies: transactionOwner.cookies,
      fn: () =>
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: ownerAccount.id,
            amount: 125.5,
            categoryId: ownerCategory.id,
          }),
        }),
    });
    expect(sharedExpenseResponse.statusCode).toBe(200);
    const sharedExpense = helpers.extractResponse<{ id: string }[]>(
      sharedExpenseResponse as unknown as helpers.CustomResponse<{ id: string }[]>,
    )[0];
    if (!sharedExpense) throw new Error('Transaction creation returned no transaction');
    expect(sharedExpense).toEqual(expect.objectContaining({ id: expect.any(String) }));
    const invitation = await helpers.asUser({
      cookies: transactionOwner.cookies,
      fn: () =>
        helpers.createShareInvitation({
          inviteeEmail: currentUser.email!,
          resourceType: RESOURCE_TYPES.account,
          resourceId: ownerAccount.id,
          permission: SHARE_PERMISSIONS.read,
          raw: true,
        }),
    });
    await helpers.acceptShareInvitation({ token: invitation.token, raw: true });

    const vehicle = await helpers.createVehicle({
      name: 'Revoked transaction car',
      currencyCode: global.BASE_CURRENCY.code,
      make: 'Toyota',
      model: 'Corolla',
      year: 2022,
      vehicleClass: VEHICLE_CLASS.sedan,
      purchasePrice: 20_000,
      purchaseDate: '2022-01-01',
      raw: true,
    });
    const activity = (await helpers.getMaintenanceActivities({ raw: true })).find(
      ({ systemKey }) => systemKey === 'scheduled-service',
    )!;
    const visitResponse = await helpers.createMaintenanceVisit({
      vehicleId: vehicle.id,
      serviceDate: format(new Date(), 'yyyy-MM-dd'),
      activities: [{ activityId: activity.id }],
      transactionIds: [sharedExpense.id],
    });
    expect(visitResponse.statusCode).toBe(201);
    const visit = helpers.extractResponse<{ id: string; transactionIds: string[] }>(
      visitResponse as unknown as helpers.CustomResponse<{ id: string; transactionIds: string[] }>,
    );
    expect(visit.transactionIds).toEqual([sharedExpense.id]);

    await helpers.asUser({
      cookies: transactionOwner.cookies,
      fn: () =>
        helpers.revokeShareMember({
          resourceType: RESOURCE_TYPES.account,
          resourceId: ownerAccount.id,
          memberUserId: currentUser.id,
          raw: true,
        }),
    });

    const maintenance = await helpers.getVehicleMaintenance({ vehicleId: vehicle.id, raw: true });
    expect(maintenance.visits).toEqual([
      expect.objectContaining({
        id: visit.id,
        totalCost: 0,
        transactionIds: [],
        generatedTransactionIds: [],
      }),
    ]);
  });

  it('cascades maintenance data on vehicle deletion while preserving the linked expense', async () => {
    const vehicle = await helpers.createVehicle({
      name: 'Lifecycle maintenance car',
      currencyCode: global.BASE_CURRENCY.code,
      make: 'Toyota',
      model: 'Corolla',
      year: 2022,
      vehicleClass: VEHICLE_CLASS.sedan,
      purchasePrice: 20_000,
      purchaseDate: '2022-01-01',
      raw: true,
    });
    const activity = (await helpers.getMaintenanceActivities({ raw: true })).find(
      ({ systemKey }) => systemKey === 'scheduled-service',
    )!;
    const plan = await helpers.createMaintenancePlan({
      vehicleId: vehicle.id,
      activityId: activity.id,
      nextDueDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      raw: true,
    });
    const account = await helpers.createAccount({ raw: true });
    const [expense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 125.5,
        note: 'Lifecycle maintenance expense',
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });
    const visit = await helpers.createMaintenanceVisit({
      vehicleId: vehicle.id,
      serviceDate: format(new Date(), 'yyyy-MM-dd'),
      activities: [{ activityId: activity.id }],
      transactionIds: [expense.id],
      raw: true,
    });

    expect(visit.transactionIds).toEqual([expense.id]);
    expect((await helpers.getMaintenanceReminders({ raw: true })).map(({ planId }) => planId)).toContain(plan.id);

    const deleteResponse = await helpers.deleteVehicle({ id: vehicle.id, raw: true });
    expect(deleteResponse).toEqual({ id: vehicle.id });

    const maintenanceResponse = await helpers.getVehicleMaintenance({ vehicleId: vehicle.id, raw: false });
    expect(maintenanceResponse.statusCode).toBe(404);
    expect(await helpers.getMaintenanceReminders({ raw: true })).toEqual([]);

    const preservedExpense = await helpers.getTransactionById({ id: expense.id, raw: true });
    expect(preservedExpense).toMatchObject({ id: expense.id, note: 'Lifecycle maintenance expense' });

    const eligibleTransactions = await helpers.getEligibleMaintenanceTransactions({ raw: true });
    expect(eligibleTransactions.map(({ id }) => id)).toContain(expense.id);
  });
});
