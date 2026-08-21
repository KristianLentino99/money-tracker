import { PlanCategoryMembershipModel, RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import Categories from '@models/categories.model';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

import Plans from './plan.model';

@Table({ tableName: 'PlanCategoryMemberships', timestamps: true, freezeTableName: true })
export default class PlanCategoryMemberships extends Model implements PlanCategoryMembershipModel {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Plans)
  @Column({ type: DataType.UUID, allowNull: false })
  declare planId: RecordId;

  @ForeignKey(() => Categories)
  @Column({ type: DataType.UUID, allowNull: true })
  declare categoryId: RecordId | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare active: boolean;

  @Column({ type: DataType.DATE, allowNull: true })
  declare detachedAt: Date | null;

  @Column({ type: DataType.STRING, allowNull: false })
  declare categoryNameSnapshot: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare categoryGroupNameSnapshot: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Plans, 'planId')
  plan!: Plans;

  @BelongsTo(() => Categories, 'categoryId')
  category!: Categories | null;
}
