import { dateString, positiveAmountString, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { createInvestmentContribution } from '@services/investments/portfolios/transfers';
import { z } from 'zod';

import { investmentContributionPurchaseSchema } from './investment-contribution-schemas';
import { serializeTransferResponse } from './serialize-transfer';

const schema = z.object({
  params: z.object({ id: recordId() }),
  body: z.object({
    accountId: recordId(),
    amount: positiveAmountString(),
    date: dateString(),
    categoryId: recordId(),
    description: z.string().max(2000).nullable().optional(),
    purchases: z.array(investmentContributionPurchaseSchema).min(1).max(50),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const transfer = await createInvestmentContribution({
    userId: user.id,
    portfolioId: params.id,
    ...body,
  });

  return { data: serializeTransferResponse({ transfer }), statusCode: 201 };
});
