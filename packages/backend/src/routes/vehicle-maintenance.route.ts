import createActivity from '@controllers/vehicle-maintenance/create-activity';
import getActivities from '@controllers/vehicle-maintenance/get-activities';
import getEligibleTransactions from '@controllers/vehicle-maintenance/get-eligible-transactions';
import getReminders from '@controllers/vehicle-maintenance/get-reminders';
import updateActivity from '@controllers/vehicle-maintenance/update-activity';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get(
  '/eligible-transactions',
  authenticateSession,
  validateEndpoint(getEligibleTransactions.schema),
  getEligibleTransactions.handler,
);
router.get('/activities', authenticateSession, validateEndpoint(getActivities.schema), getActivities.handler);
router.get('/reminders', authenticateSession, validateEndpoint(getReminders.schema), getReminders.handler);
router.post(
  '/activities',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(createActivity.schema),
  createActivity.handler,
);
router.patch(
  '/activities/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(updateActivity.schema),
  updateActivity.handler,
);

export default router;
