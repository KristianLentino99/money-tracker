import { PlanAccountMembershipModel, RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import Accounts from '@models/accounts.model';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

import Plans from './plan.model';

@Table({ tableName: 'PlanAccountMemberships', timestamps: true, freezeTableName: true })
export default class PlanAccountMemberships extends Model implements PlanAccountMembershipModel {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Plans)
  @Column({ type: DataType.UUID, allowNull: false })
  declare planId: RecordId;

  @ForeignKey(() => Accounts)
  @Column({ type: DataType.UUID, allowNull: true })
  declare accountId: RecordId | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare active: boolean;

  @Column({ type: DataType.DATE, allowNull: true })
  declare detachedAt: Date | null;

  @Column({ type: DataType.STRING, allowNull: false })
  declare accountNameSnapshot: string;

  @Column({ type: DataType.STRING(3), allowNull: true })
  declare currencyCodeSnapshot: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Plans, 'planId')
  plan!: Plans;

  @BelongsTo(() => Accounts, 'accountId')
  account!: Accounts | null;
}
