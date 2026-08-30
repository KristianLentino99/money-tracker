import type { RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';
import VehicleMaintenancePlans from '@models/vehicle-maintenance-plans.model';
import VehicleMaintenanceVisits from '@models/vehicle-maintenance-visits.model';
import { BelongsTo, Column, DataType, ForeignKey, Index, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'VehicleMaintenanceVisitActivities',
  timestamps: true,
  freezeTableName: true,
})
export default class VehicleMaintenanceVisitActivities extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => VehicleMaintenanceVisits)
  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  declare visitId: RecordId;

  @ForeignKey(() => VehicleMaintenanceActivities)
  @Index
  @Column({ type: DataType.UUID, allowNull: true })
  declare activityId: RecordId | null;

  @ForeignKey(() => VehicleMaintenancePlans)
  @Index
  @Column({ type: DataType.UUID, allowNull: true })
  declare planId: RecordId | null;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare labelSnapshot: string;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => VehicleMaintenanceVisits, 'visitId')
  visit!: VehicleMaintenanceVisits;

  @BelongsTo(() => VehicleMaintenanceActivities, 'activityId')
  activity!: VehicleMaintenanceActivities | null;

  @BelongsTo(() => VehicleMaintenancePlans, 'planId')
  plan!: VehicleMaintenancePlans | null;
}
