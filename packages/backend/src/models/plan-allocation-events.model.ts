import { PlanAllocationEventModel, RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import Users from '@models/users.model';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

import Plans from './plan.model';

type AssignmentSnapshot = Record<string, number>;

@Table({ tableName: 'PlanAllocationEvents', timestamps: false, freezeTableName: true })
export default class PlanAllocationEvents extends Model implements PlanAllocationEventModel {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Plans)
  @Column({ type: DataType.UUID, allowNull: false })
  declare planId: RecordId;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare periodStart: string;

  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare actorUserId: number;

  @Column({ type: DataType.STRING(32), allowNull: false })
  declare action: PlanAllocationEventModel['action'];

  @Column({ type: DataType.UUID, allowNull: false })
  declare requestId: string;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare payloadFingerprint: string;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare before: AssignmentSnapshot;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare after: AssignmentSnapshot;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare expectedRevision: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare resultRevision: number;

  @Column({ type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

  @BelongsTo(() => Plans, 'planId')
  plan!: Plans;

  @BelongsTo(() => Users, 'actorUserId')
  actor!: Users;
}
