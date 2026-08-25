import type { RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { Money } from '@common/types/money';
import { MoneyField } from '@common/types/money-column';
import Categories from '@models/categories.model';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

import Plans from './plan.model';

@Table({ tableName: 'PlanCategoryTargets', timestamps: true, freezeTableName: true })
export default class PlanCategoryTargets extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Plans)
  @Column({ type: DataType.UUID, allowNull: false })
  declare planId: RecordId;

  @Column({ type: DataType.UUID, allowNull: false })
  declare categoryIdentity: RecordId;

  @ForeignKey(() => Categories)
  @Column({ type: DataType.UUID, allowNull: true })
  declare categoryId: RecordId | null;

  @Column({ type: DataType.STRING, allowNull: false })
  declare categoryNameSnapshot: string;

  @MoneyField({ storage: 'cents' })
  declare targetAmountCents: Money;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare dueDate: string;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Plans, 'planId')
  plan!: Plans;

  @BelongsTo(() => Categories, 'categoryId')
  category!: Categories | null;
}
