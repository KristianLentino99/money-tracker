import VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';
import { Op } from 'sequelize';

interface GetVehicleMaintenanceActivitiesParams {
  userId: number;
}

export const getVehicleMaintenanceActivities = ({ userId }: GetVehicleMaintenanceActivitiesParams) => {
  return VehicleMaintenanceActivities.findAll({
    attributes: ['id', 'systemKey', 'name', 'archivedAt'],
    where: {
      [Op.or]: [{ userId: null }, { userId, archivedAt: null }],
    },
    order: [
      ['sortOrder', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });
};
