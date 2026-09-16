import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { createInvestmentContributionFromTransaction } from '@services/investments/portfolios/transfers';
import { z } from 'zod';

import { investmentContributionPurchaseSchema } from './investment-contribution-schemas';
import { serializeTransferResponse } from './serialize-transfer';

const schema = z.object({
  params: z.object({ id: recordId() }),
  body: z.object({
    portfolioId: recordId(),
    categoryId: recordId(),
    purchases: z.array(investmentContributionPurchaseSchema).min(1).max(50),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const transfer = await createInvestmentContributionFromTransaction({
    userId: user.id,
    transactionId: params.id,
    ...body,
  });

  return { data: serializeTransferResponse({ transfer }), statusCode: 201 };
});
