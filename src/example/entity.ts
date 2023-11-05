import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Blog extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  content: string;
}
