import { BaseEntity, Column, Entity, PrimaryColumn } from "typeorm";

@Entity()
export class Round extends BaseEntity {
    @PrimaryColumn()
    public id: number;

    @Column()
    public topDelegates: string;

    @Column("bigint")
    public forged: number;

    @Column("bigint")
    public removed: number;

    @Column("bigint")
    public staked: number;

    @Column("bigint")
    public released: number;
}
