import createActivity from '@controllers/vehicle-maintenance/create-activity';
import getActivities from '@controllers/vehicle-maintenance/get-activities';
import getEligibleTransactions from '@controllers/vehicle-maintenance/get-eligible-transactions';
import getReminders from '@controllers/vehicle-maintenance/get-reminders';
import updateActivity from '@controllers/vehicle-maintenance/update-activity';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { Router } from 'express';

const router = Router({});

router.get('/eligible-transactions', authenticateSession, getEligibleTransactions);
router.get('/activities', authenticateSession, getActivities);
router.get('/reminders', authenticateSession, getReminders);
router.post('/activities', authenticateSession, checkBaseCurrencyLock, createActivity);
router.patch('/activities/:id', authenticateSession, checkBaseCurrencyLock, updateActivity);

export default router;
