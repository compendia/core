import { BaseEntity, Column, Entity, PrimaryColumn } from "typeorm";

@Entity()
export class Round extends BaseEntity {
    @PrimaryColumn("int")
    public id: number;

    @Column("varchar")
    public forged: string;

    @Column("varchar")
    public removed: string;

    @Column("varchar")
    public staked: string;

    @Column("varchar")
    public released: string;
}
