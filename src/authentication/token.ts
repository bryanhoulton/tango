import {
  BaseEntity,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from './user';

@Entity()
export class Token extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  value: string;

  @OneToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;
}
