import { asDecimal, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, VEHICLE_CLASS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('Eligible vehicle maintenance transactions', () => {
  describe('GET /vehicle-maintenance/eligible-transactions', () => {
    it('returns empty state and then only owned, real, unlinked expenses in the compact picker shape', async () => {
      expect(await helpers.getEligibleMaintenanceTransactions({ raw: true })).toEqual([]);

      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'Daily account' }),
        raw: true,
      });
      const transferDestinationAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'Savings account' }),
        raw: true,
      });
      const balanceAdjustmentAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'Reconciliation account' }),
        raw: true,
      });
      const category = (await helpers.getCategoriesList()).find(({ id }) => id === global.DEFAULT_CATEGORY_ID)!;
      const payee = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Trusted garage' }),
        raw: true,
      });

      const [eligibleExpense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 42.5,
          time: '2026-08-20T12:34:00.000Z',
          note: 'Eligible maintenance expense',
          categoryId: category.id,
          payeeId: payee.id,
          payeeLocked: true,
        }),
        raw: true,
      });
      const [income] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 11,
          transactionType: TRANSACTION_TYPES.income,
          note: 'Income must not be selectable',
        }),
        raw: true,
      });
      const [forecast] = await helpers.createPlannedTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 13,
          note: 'Forecast must not be selectable',
        }),
        raw: true,
      });
      const [transfer, oppositeTransfer] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 17,
          destinationAccountId: transferDestinationAccount.id,
          destinationAmount: 17,
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          note: 'Transfer must not be selectable',
        }),
        raw: true,
      });
      const balanceAdjustment = (
        await helpers.balanceAdjustment({
          id: balanceAdjustmentAccount.id,
          payload: { targetBalance: asDecimal(25) },
          raw: true,
        })
      ).transaction!;

      const [refundableExpense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 19,
          note: 'Refunded expense must not be selectable',
        }),
        raw: true,
      });
      const [refund] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 19,
          transactionType: TRANSACTION_TYPES.income,
          note: 'Refund must not be selectable',
        }),
        raw: true,
      });
      await helpers.createSingleRefund({ originalTxId: refundableExpense.id, refundTxId: refund.id }, true);

      const [linkedExpense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 23.75,
          note: 'Already linked expense must not be selectable',
        }),
        raw: true,
      });
      const vehicle = await helpers.createVehicle({
        name: 'Maintenance picker car',
        currencyCode: global.BASE_CURRENCY.code,
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 20_000,
        purchaseDate: '2022-01-01',
        raw: true,
      });
      await helpers.createMaintenanceVisit({
        vehicleId: vehicle.id,
        serviceDate: '2026-08-25',
        activities: [{ label: 'Workshop service' }],
        transactionIds: [linkedExpense.id],
        raw: true,
      });

      const transactions = await helpers.getEligibleMaintenanceTransactions({ raw: true });

      expect(transactions).toEqual([
        {
          id: eligibleExpense.id,
          date: '2026-08-20',
          amount: 42.5,
          refAmount: 42.5,
          note: 'Eligible maintenance expense',
          account: { id: account.id, name: account.name },
          category: { id: category.id, name: category.name },
          payee: { id: payee.id, name: payee.name },
        },
      ]);
      expect(transactions.map(({ id }) => id)).not.toEqual(
        expect.arrayContaining([
          income.id,
          forecast.id,
          transfer.id,
          oppositeTransfer!.id,
          balanceAdjustment.id,
          refundableExpense.id,
          refund.id,
          linkedExpense.id,
        ]),
      );
    });

    it('rejects unauthenticated requests', async () => {
      const response = await helpers.withoutSession(() => helpers.getEligibleMaintenanceTransactions());

      expect(response.statusCode).toBe(401);
    });
  });
});
