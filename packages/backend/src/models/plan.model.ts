import { PLAN_STATUSES, PLAN_VISIBILITIES, PlanModel, RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import Currencies from '@models/currencies.model';
import Users from '@models/users.model';
import { BelongsTo, Column, DataType, ForeignKey, HasMany, Model, Table } from 'sequelize-typescript';

import PlanAccountMemberships from './plan-account-memberships.model';
import PlanAllocationEvents from './plan-allocation-events.model';
import PlanCategoryMemberships from './plan-category-memberships.model';
import PlanCategoryTargets from './plan-category-targets.model';
import PlanPeriods from './plan-periods.model';

@Table({ tableName: 'Plans', timestamps: true, freezeTableName: true })
export default class Plans extends Model implements PlanModel {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare ownerUserId: number;

  @Column({ type: DataType.STRING(200), allowNull: false })
  declare name: string;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: PLAN_VISIBILITIES.private,
  })
  declare visibility: PlanModel['visibility'];

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: PLAN_STATUSES.active,
  })
  declare status: PlanModel['status'];

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isDefault: boolean;

  @ForeignKey(() => Currencies)
  @Column({ type: DataType.STRING(3), allowNull: false })
  declare baseCurrencyCode: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare periodStartDay: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare includeHistoricalTransactions: boolean;

  @Column({ type: DataType.DATE, allowNull: true })
  declare archivedAt: Date | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Users, 'ownerUserId')
  owner!: Users;

  @BelongsTo(() => Currencies, 'baseCurrencyCode')
  baseCurrency!: Currencies;

  @HasMany(() => PlanCategoryMemberships)
  categoryMemberships!: PlanCategoryMemberships[];

  @HasMany(() => PlanCategoryTargets)
  categoryTargets!: PlanCategoryTargets[];

  @HasMany(() => PlanAccountMemberships)
  accountMemberships!: PlanAccountMemberships[];

  @HasMany(() => PlanPeriods)
  periods!: PlanPeriods[];

  @HasMany(() => PlanAllocationEvents)
  allocationEvents!: PlanAllocationEvents[];
}
