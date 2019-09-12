import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Stake extends BaseEntity {
    @PrimaryGeneratedColumn()
    public id: number;

    @Column("integer")
    public stakeKey: number;

    @Column({
        length: 34,
    })
    public address: string;

    @Column("integer")
    public redeemableTimestamp: number;
}
