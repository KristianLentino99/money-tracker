import { RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { Money } from '@common/types/money';
import { MoneyField } from '@common/types/money-column';
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index } from 'sequelize-typescript';

import Portfolios from './portfolios.model';

@Table({ timestamps: true, tableName: 'ManualPortfolioValuations' })
export default class ManualPortfolioValuations extends Model {
  @Column(IdColumn()) declare id: RecordId;
  @ForeignKey(() => Portfolios) @Index @Column({ type: DataType.UUID, allowNull: false }) portfolioId!: RecordId;
  @MoneyField({ storage: 'decimal', precision: 20, scale: 10 }) declare value: Money;
  @Index @Column({ type: DataType.DATEONLY, allowNull: false }) date!: string;
  @Column({ type: DataType.TEXT, allowNull: true }) note!: string | null;
  @Column({ type: DataType.STRING(64), allowNull: true }) source!: string | null;
  @BelongsTo(() => Portfolios) portfolio?: Portfolios;
}
