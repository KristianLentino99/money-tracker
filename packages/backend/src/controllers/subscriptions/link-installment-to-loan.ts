import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { linkInstallmentToLoan, unlinkInstallmentFromLoan } from '@services/subscriptions/link-installment-to-loan';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }),
  body: z.object({ loanAccountId: recordId() }),
});

export const linkInstallment = createController(schema, async ({ user, params, body }) => ({
  data: await linkInstallmentToLoan({
    userId: user.id,
    subscriptionId: params.id,
    loanAccountId: body.loanAccountId,
  }),
}));

export const unlinkInstallment = createController(
  z.object({ params: z.object({ id: recordId() }) }),
  async ({ user, params }) => ({
    data: await unlinkInstallmentFromLoan({
      userId: user.id,
      subscriptionId: params.id,
    }),
  }),
);
