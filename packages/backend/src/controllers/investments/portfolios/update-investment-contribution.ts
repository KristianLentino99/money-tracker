import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { updateInvestmentContribution } from '@services/investments/portfolios/transfers';
import { z } from 'zod';

import { investmentContributionPurchaseSchema } from './investment-contribution-schemas';
import { serializeTransferResponse } from './serialize-transfer';

const schema = z.object({
  params: z.object({ id: recordId(), transferId: recordId() }),
  body: z.object({ purchases: z.array(investmentContributionPurchaseSchema).min(1).max(50) }),
});

export default createController(schema, async ({ user, params, body }) => {
  const transfer = await updateInvestmentContribution({
    userId: user.id,
    portfolioId: params.id,
    transferId: params.transferId,
    purchases: body.purchases,
  });

  return { data: serializeTransferResponse({ transfer }) };
});
