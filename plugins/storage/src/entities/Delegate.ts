import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Delegate extends BaseEntity {
    @PrimaryGeneratedColumn()
    public id: number;

    @Column("varchar")
    public publicKey: string;

    @Column("varchar")
    public topRewards: string;
}
