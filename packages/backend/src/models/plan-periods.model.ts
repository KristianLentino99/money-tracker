import { PlanPeriodModel, RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

import Plans from './plan.model';

@Table({ tableName: 'PlanPeriods', timestamps: true, freezeTableName: true })
export default class PlanPeriods extends Model implements PlanPeriodModel {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Plans)
  @Column({ type: DataType.UUID, allowNull: false })
  declare planId: RecordId;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare periodStart: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare revision: number;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Plans, 'planId')
  plan!: Plans;
}
