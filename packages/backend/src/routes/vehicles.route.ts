import createMaintenancePlan from '@controllers/vehicle-maintenance/create-plan';
import createMaintenanceVisit from '@controllers/vehicle-maintenance/create-visit';
import deleteMaintenanceVisit from '@controllers/vehicle-maintenance/delete-visit';
import getVehicleMaintenance from '@controllers/vehicle-maintenance/get-vehicle-maintenance';
import updateMaintenancePlan from '@controllers/vehicle-maintenance/update-plan';
import updateMaintenanceVisit from '@controllers/vehicle-maintenance/update-visit';
import createVehicle from '@controllers/vehicles/create-vehicle';
import deleteVehicle from '@controllers/vehicles/delete-vehicle';
import getVehicle from '@controllers/vehicles/get-vehicle';
import getVehicles from '@controllers/vehicles/get-vehicles';
import updateVehicle from '@controllers/vehicles/update-vehicle';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { Router } from 'express';

const router = Router({});

router.use(authenticateSession);

router.get('/', getVehicles);
router.get('/:id', getVehicle);
router.get('/:id/maintenance', getVehicleMaintenance);
router.post('/', checkBaseCurrencyLock, createVehicle);
router.patch('/:id', checkBaseCurrencyLock, updateVehicle);
router.post('/:id/maintenance/visits', checkBaseCurrencyLock, createMaintenanceVisit);
router.delete('/:id/maintenance/visits/:visitId', checkBaseCurrencyLock, deleteMaintenanceVisit);
router.patch('/:id/maintenance/visits/:visitId', checkBaseCurrencyLock, updateMaintenanceVisit);
router.post('/:id/maintenance/plans', checkBaseCurrencyLock, createMaintenancePlan);
router.patch('/:id/maintenance/plans/:planId', checkBaseCurrencyLock, updateMaintenancePlan);
router.delete('/:id', checkBaseCurrencyLock, deleteVehicle);

export default router;
