import { createController } from '@controllers/helpers/controller-factory';
import { serializeEligibleMaintenanceTransaction } from '@root/serializers/eligible-maintenance-transactions.serializer';
import { getEligibleMaintenanceTransactions } from '@services/vehicle-maintenance/get-eligible-transactions.service';
import { z } from 'zod';

export default createController(z.object({}), async ({ user }) => {
  const transactions = await getEligibleMaintenanceTransactions({ userId: user.id });

  return {
    data: transactions.map((transaction) => serializeEligibleMaintenanceTransaction({ transaction })),
  };
});
