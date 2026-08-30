import { type RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import Users from '@models/users.model';
import { BelongsTo, Column, DataType, ForeignKey, Index, Model, Table } from 'sequelize-typescript';

export const VEHICLE_MAINTENANCE_SYSTEM_KEYS = [
  'inspection',
  'scheduled-service',
  'oil-change',
  'tires',
  'brakes',
  'battery',
  'other',
] as const;

export type VehicleMaintenanceSystemKey = (typeof VEHICLE_MAINTENANCE_SYSTEM_KEYS)[number];

@Table({
  tableName: 'VehicleMaintenanceActivities',
  timestamps: true,
  freezeTableName: true,
})
export default class VehicleMaintenanceActivities extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  // Null userId identifies a global activity preset; non-null values are user-owned activities.
  @ForeignKey(() => Users)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare userId: number | null;

  // Global presets use a stable key so labels can be localized without storing translated text.
  @Index
  @Column({ type: DataType.STRING(50), allowNull: true })
  declare systemKey: VehicleMaintenanceSystemKey | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare name: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1000 })
  declare sortOrder: number;

  @Column({ type: DataType.DATE, allowNull: true })
  declare archivedAt: Date | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Users)
  user?: Users;
}
