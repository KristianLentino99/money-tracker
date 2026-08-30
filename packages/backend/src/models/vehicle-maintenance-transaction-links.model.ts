import type { RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import Transactions from '@models/transactions.model';
import VehicleMaintenanceVisits from '@models/vehicle-maintenance-visits.model';
import { BelongsTo, Column, DataType, ForeignKey, Index, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'VehicleMaintenanceTransactionLinks',
  timestamps: true,
  freezeTableName: true,
})
export default class VehicleMaintenanceTransactionLinks extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => VehicleMaintenanceVisits)
  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  declare visitId: RecordId;

  @ForeignKey(() => Transactions)
  @Index
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare transactionId: RecordId;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare createdByMaintenance: boolean;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => VehicleMaintenanceVisits, 'visitId')
  visit!: VehicleMaintenanceVisits;

  @BelongsTo(() => Transactions, 'transactionId')
  transaction!: Transactions;
}
