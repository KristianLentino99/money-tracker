import type { RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import VehicleMaintenanceTransactionLinks from '@models/vehicle-maintenance-transaction-links.model';
import VehicleMaintenanceVisitActivities from '@models/vehicle-maintenance-visit-activities.model';
import Vehicles from '@models/vehicles.model';
import { BelongsTo, Column, DataType, ForeignKey, HasMany, Index, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'VehicleMaintenanceVisits',
  timestamps: true,
  freezeTableName: true,
})
export default class VehicleMaintenanceVisits extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Vehicles)
  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  declare vehicleId: RecordId;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare serviceDate: string;

  @Column({ type: DataType.BIGINT, allowNull: true })
  get odometerMeters(): number | null {
    const raw = this.getDataValue('odometerMeters');
    return raw == null ? null : Number(raw);
  }
  set odometerMeters(value: number | string | null) {
    this.setDataValue('odometerMeters', value);
  }

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Vehicles, 'vehicleId')
  vehicle!: Vehicles;

  @HasMany(() => VehicleMaintenanceVisitActivities, 'visitId')
  activities!: VehicleMaintenanceVisitActivities[];

  @HasMany(() => VehicleMaintenanceTransactionLinks, 'visitId')
  transactionLinks!: VehicleMaintenanceTransactionLinks[];
}
