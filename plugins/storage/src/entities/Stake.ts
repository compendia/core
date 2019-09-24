import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Stake extends BaseEntity {
    @PrimaryGeneratedColumn()
    public id: number;

    @Column({ length: 64 })
    public stakeKey: string;

    @Column({
        length: 34,
    })
    public address: string;

    @Column("integer")
    public redeemableTimestamp: number;
}
