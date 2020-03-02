import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Statistic extends BaseEntity {
    @PrimaryGeneratedColumn()
    public id: number;

    @Column("varchar")
    public name: string;

    @Column("varchar")
    public value: string;
}
