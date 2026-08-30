import type { RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';
import Vehicles from '@models/vehicles.model';
import { BelongsTo, Column, DataType, ForeignKey, Index, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'VehicleMaintenancePlans',
  timestamps: true,
  freezeTableName: true,
})
export default class VehicleMaintenancePlans extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Vehicles)
  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  declare vehicleId: RecordId;

  @ForeignKey(() => VehicleMaintenanceActivities)
  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  declare activityId: RecordId;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare nextDueDate: string | null;

  @Column({ type: DataType.BIGINT, allowNull: true })
  get nextDueDistanceMeters(): number | null {
    const raw = this.getDataValue('nextDueDistanceMeters');
    return raw == null ? null : Number(raw);
  }
  set nextDueDistanceMeters(value: number | string | null) {
    this.setDataValue('nextDueDistanceMeters', value);
  }

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 30 })
  declare leadDays: number;

  @Column({ type: DataType.BIGINT, allowNull: false, defaultValue: 1_000_000 })
  get leadDistanceMeters(): number {
    const raw = this.getDataValue('leadDistanceMeters');
    return Number(raw);
  }
  set leadDistanceMeters(value: number | string) {
    this.setDataValue('leadDistanceMeters', value);
  }

  @Column({ type: DataType.DATE, allowNull: true })
  declare archivedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare upcomingNotifiedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare overdueNotifiedAt: Date | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Vehicles, 'vehicleId')
  vehicle!: Vehicles;

  @BelongsTo(() => VehicleMaintenanceActivities, 'activityId')
  activity!: VehicleMaintenanceActivities;
}
