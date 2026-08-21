import {
  addPlanCategory,
  archivePlan,
  assignPlanCategory,
  autoAssign,
  bulkAssignPlanCategories,
  createPlan,
  deletePlan,
  getPlan,
  getPlanView,
  listPlans,
  movePlanMoney,
  previewAutoAssign,
  undoPlanAllocation,
  updatePlan,
} from '@controllers/plans.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { blockDemoUsers } from '@middlewares/block-demo-users';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router();

router.get('/', authenticateSession, validateEndpoint(listPlans.schema), listPlans.handler);
router.post(
  '/',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(createPlan.schema),
  createPlan.handler,
);
router.get('/:id/view', authenticateSession, validateEndpoint(getPlanView.schema), getPlanView.handler);
router.post(
  '/:id/categories',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(addPlanCategory.schema),
  addPlanCategory.handler,
);
router.get('/:id', authenticateSession, validateEndpoint(getPlan.schema), getPlan.handler);
router.patch(
  '/:id',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(updatePlan.schema),
  updatePlan.handler,
);
router.patch(
  '/:id/archive',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(archivePlan.schema),
  archivePlan.handler,
);
router.delete(
  '/:id',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(deletePlan.schema),
  deletePlan.handler,
);
router.put(
  '/:id/periods/:periodStart/assignments/:categoryId',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(assignPlanCategory.schema),
  assignPlanCategory.handler,
);
router.post(
  '/:id/periods/:periodStart/move',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(movePlanMoney.schema),
  movePlanMoney.handler,
);
router.post(
  '/:id/periods/:periodStart/assignments/bulk',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(bulkAssignPlanCategories.schema),
  bulkAssignPlanCategories.handler,
);
router.post(
  '/:id/periods/:periodStart/auto-assign/preview',
  authenticateSession,
  validateEndpoint(previewAutoAssign.schema),
  previewAutoAssign.handler,
);
router.post(
  '/:id/periods/:periodStart/auto-assign',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(autoAssign.schema),
  autoAssign.handler,
);
router.post(
  '/:id/periods/:periodStart/undo',
  authenticateSession,
  blockDemoUsers,
  checkBaseCurrencyLock,
  validateEndpoint(undoPlanAllocation.schema),
  undoPlanAllocation.handler,
);

export default router;
