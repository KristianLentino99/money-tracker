import { recordId } from '@common/lib/zod/custom-types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { serializeLoan, serializeLoans } from '@root/serializers/loans.serializer';
import { countLoanPayments, countLoanPaymentsByAccountIds } from '@services/loans/count-loan-payments.service';
import { createLoan } from '@services/loans/create-loan.service';
import { deleteLoan } from '@services/loans/delete-loan.service';
import { getLoanBalanceHistory } from '@services/loans/get-loan-balance-history.service';
import { getLoanById } from '@services/loans/get-loan-by-id.service';
import { getLoanInstallments } from '@services/loans/get-loan-installments.service';
import { getLoans } from '@services/loans/get-loans.service';
import { linkLoanPayments } from '@services/loans/link-loan-payments.service';
import { projectLoan } from '@services/loans/project-loan';
import { unlinkLoanPayment } from '@services/loans/unlink-loan-payment.service';
import { updateLoan } from '@services/loans/update-loan.service';
import {
  createLoanBodySchema,
  linkLoanPaymentsBodySchema,
  loanNoteEventSchema,
  unlinkLoanPaymentBodySchema,
  updateLoanBodySchema,
} from '@services/loans/zod-schemas';

import { assertMcpMutationAllowed, getUserId, jsonContent } from './helpers';

const loanIdInputSchema = {
  loanAccountId: recordId().describe('Loan account ID'),
};

const getLoanDetails = async ({ userId, loanAccountId }: { userId: number; loanAccountId: string }) => {
  const loanDetails = await getLoanById({ userId, accountId: loanAccountId });
  const account = loanDetails.account;
  if (!account) throw new Error('Loan account is missing from the loaded loan.');

  const [loanInstallments, paymentsCount] = await Promise.all([
    getLoanInstallments({ userId, accountId: loanAccountId }),
    countLoanPayments({ userId, accountId: loanAccountId }),
  ]);

  return serializeLoan({
    loanDetails,
    projection: projectLoan({ loanDetails, account, today: new Date() }),
    paymentsCount,
    loanInstallments,
  });
};

export function registerGetLoans(server: McpServer) {
  server.registerTool(
    'get_loans',
    {
      description:
        'List all loans with decimal balances, loan terms, payment counts, and payoff projections. Linked installment schedules are included for each loan.',
    },
    async (extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_loans', clientId: extra.authInfo?.clientId });

      const loanRecords = await getLoans({ userId });
      const paymentCounts = await countLoanPaymentsByAccountIds({
        userId,
        accountIds: loanRecords.map((loan) => loan.accountId),
      });
      const today = new Date();

      return jsonContent({
        data: serializeLoans(
          loanRecords.map((loanDetails) => {
            if (!loanDetails.account) throw new Error('Loan account is missing from the loaded loan.');
            return {
              loanDetails,
              projection: projectLoan({ loanDetails, account: loanDetails.account, today }),
              paymentsCount: paymentCounts.get(loanDetails.accountId) ?? 0,
            };
          }),
        ),
      });
    },
  );
}

export function registerGetLoan(server: McpServer) {
  server.registerTool(
    'get_loan',
    {
      description:
        'Retrieve one loan by account ID with decimal loan details, balance projection, payment count, balance anchor, timeline events, and linked installment schedules.',
      inputSchema: loanIdInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_loan', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await getLoanDetails({ userId, loanAccountId: args.loanAccountId }) });
    },
  );
}

export function registerGetLoanBalanceHistory(server: McpServer) {
  server.registerTool(
    'get_loan_balance_history',
    {
      description:
        'Get the loan outstanding balance timeline in the loan native currency as decimal amounts, including the anchor and subsequent payment dates.',
      inputSchema: loanIdInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_loan_balance_history', clientId: extra.authInfo?.clientId });

      return jsonContent({
        data: await getLoanBalanceHistory({ userId, accountId: args.loanAccountId }),
      });
    },
  );
}

const createLoanInputSchema = {
  ...createLoanBodySchema.shape,
};

export function registerCreateLoan(server: McpServer) {
  server.registerTool(
    'create_loan',
    {
      description:
        'Create a loan account and its loan details. Monetary inputs are positive decimal values; the returned account balance follows the liability convention. Requires finance:write scope.',
      inputSchema: createLoanInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'create_loan', clientId: extra.authInfo?.clientId });

      const loanDetails = await createLoan({ userId, ...args });
      if (!loanDetails.account) throw new Error('Created loan account is missing.');

      return jsonContent({
        data: serializeLoan({
          loanDetails,
          projection: projectLoan({ loanDetails, account: loanDetails.account, today: new Date() }),
          paymentsCount: 0,
        }),
      });
    },
  );
}

const updateLoanInputSchema = {
  ...loanIdInputSchema,
  data: updateLoanBodySchema,
};

export function registerUpdateLoan(server: McpServer) {
  server.registerTool(
    'update_loan',
    {
      description:
        'Update loan metadata, payment terms, or the positive outstanding balance and anchor date. Only supplied fields change. Requires finance:write scope.',
      inputSchema: updateLoanInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'update_loan', clientId: extra.authInfo?.clientId });

      const { loanAccountId, data } = args;
      const loanDetails = await updateLoan({ userId, accountId: loanAccountId, ...data });
      if (!loanDetails.account) throw new Error('Updated loan account is missing.');

      return jsonContent({
        data: serializeLoan({
          loanDetails,
          projection: projectLoan({ loanDetails, account: loanDetails.account, today: new Date() }),
          paymentsCount: await countLoanPayments({ userId, accountId: loanAccountId }),
        }),
      });
    },
  );
}

export function registerDeleteLoan(server: McpServer) {
  server.registerTool(
    'delete_loan',
    {
      description:
        'Permanently delete a loan account when it has no linked payment legs. Requires finance:delete scope.',
      inputSchema: loanIdInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId, scope: 'finance:delete' });
      trackMcpToolUsed({ userId, tool: 'delete_loan', clientId: extra.authInfo?.clientId });

      await deleteLoan({ userId, accountId: args.loanAccountId });
      return jsonContent({ data: null });
    },
  );
}

const appendLoanNoteInputSchema = {
  ...loanIdInputSchema,
  ...loanNoteEventSchema.shape,
};

export function registerAppendLoanNote(server: McpServer) {
  server.registerTool(
    'append_loan_note',
    {
      description: 'Append a user note to the loan timeline. Requires finance:write scope.',
      inputSchema: appendLoanNoteInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'append_loan_note', clientId: extra.authInfo?.clientId });

      const loanDetails = await updateLoan({ userId, accountId: args.loanAccountId, appendNote: args.text });
      if (!loanDetails.account) throw new Error('Updated loan account is missing.');

      return jsonContent({
        data: serializeLoan({
          loanDetails,
          projection: projectLoan({ loanDetails, account: loanDetails.account, today: new Date() }),
          paymentsCount: await countLoanPayments({ userId, accountId: args.loanAccountId }),
        }),
      });
    },
  );
}

const linkLoanPaymentsInputSchema = {
  ...loanIdInputSchema,
  ...linkLoanPaymentsBodySchema.shape,
};

export function registerLinkLoanPayments(server: McpServer) {
  server.registerTool(
    'link_loan_payments',
    {
      description:
        'Link existing expense transactions to a loan as payments. Pass confirmOverpay=true only after reviewing an overpayment error. Requires finance:write scope.',
      inputSchema: linkLoanPaymentsInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'link_loan_payments', clientId: extra.authInfo?.clientId });

      const { linkedCount } = await linkLoanPayments({
        userId,
        accountId: args.loanAccountId,
        transactionIds: args.transactionIds,
        confirmOverpay: args.confirmOverpay,
      });

      return jsonContent({
        data: {
          loan: await getLoanDetails({ userId, loanAccountId: args.loanAccountId }),
          linkedCount,
        },
      });
    },
  );
}

const unlinkLoanPaymentInputSchema = {
  ...loanIdInputSchema,
  ...unlinkLoanPaymentBodySchema.shape,
};

export function registerUnlinkLoanPayment(server: McpServer) {
  server.registerTool(
    'unlink_loan_payment',
    {
      description:
        'Unlink one loan payment using either leg transaction ID. The source expense is restored and the loan-side leg is removed. Requires finance:write scope.',
      inputSchema: unlinkLoanPaymentInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'unlink_loan_payment', clientId: extra.authInfo?.clientId });

      const { restoredTransactionId } = await unlinkLoanPayment({
        userId,
        accountId: args.loanAccountId,
        transactionId: args.transactionId,
      });

      return jsonContent({
        data: {
          loan: await getLoanDetails({ userId, loanAccountId: args.loanAccountId }),
          restoredTransactionId,
        },
      });
    },
  );
}
