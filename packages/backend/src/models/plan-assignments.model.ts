import { IdColumn } from '@common/types/id-column';
import { Money } from '@common/types/money';
import { MoneyField } from '@common/types/money-column';
import Categories from '@models/categories.model';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

import Plans from './plan.model';

@Table({ tableName: 'PlanAssignments', timestamps: true, freezeTableName: true })
export default class PlanAssignments extends Model {
  @Column(IdColumn())
  declare id: string;

  @ForeignKey(() => Plans)
  @Column({ type: DataType.UUID, allowNull: false })
  declare planId: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare periodStart: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare categoryIdentity: string;

  @ForeignKey(() => Categories)
  @Column({ type: DataType.UUID, allowNull: true })
  declare categoryId: string | null;

  @Column({ type: DataType.STRING, allowNull: false })
  declare categoryNameSnapshot: string;

  @MoneyField({ storage: 'cents' })
  declare assignedCents: Money;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Plans, 'planId')
  plan!: Plans;

  @BelongsTo(() => Categories, 'categoryId')
  category!: Categories | null;
}
