import { BaseEntity, Column, Entity, PrimaryColumn } from "typeorm";

@Entity()
export class Round extends BaseEntity {
    @PrimaryColumn()
    public id: number;

    @Column()
    public topDelegates: string;

    @Column()
    public forged: string;

    @Column()
    public removed: string;

    @Column()
    public staked: string;

    @Column()
    public released: string;
}
