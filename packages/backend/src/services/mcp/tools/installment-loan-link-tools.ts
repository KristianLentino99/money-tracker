import { recordId } from '@common/lib/zod/custom-types';
import { linkInstallmentToLoan, unlinkInstallmentFromLoan } from '@services/subscriptions/link-installment-to-loan';

import { defineTool } from '../define-tool';

export const linkInstallmentToLoanTool = defineTool({
  name: 'link_installment_to_loan',
  toolset: 'subscriptions',
  access: 'write',
  description:
    'Link an expense installment subscription to an active loan account. The loan must still have an outstanding balance.',
  input: {
    subscriptionId: recordId().describe('Subscription ID'),
    loanAccountId: recordId().describe('Loan account ID'),
  },
  run: ({ userId, args }) => linkInstallmentToLoan({ userId, ...args }),
});

export const unlinkInstallmentFromLoanTool = defineTool({
  name: 'unlink_installment_from_loan',
  toolset: 'subscriptions',
  access: 'write',
  description: 'Remove the loan association from an installment subscription.',
  input: { subscriptionId: recordId().describe('Subscription ID') },
  run: ({ userId, args }) => unlinkInstallmentFromLoan({ userId, subscriptionId: args.subscriptionId }),
});
