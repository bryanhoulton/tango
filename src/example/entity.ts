import { Expose } from "class-transformer";
import { MinLength } from "class-validator";
import {
  BaseEntity,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { User } from "../authentication";
import { Serializer } from "../serializer";

@Entity()
export class Blog extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id: number;

  @Column()
  @Expose()
  @MinLength(0)
  content: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;
}

export class BlogSerializer extends Serializer<typeof Blog> {
  entity = Blog;
  fields = ["id", "content"];
}
