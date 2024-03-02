import { Expose } from 'class-transformer';
import { MinLength } from 'class-validator';
import {
  BaseEntity,
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Serializer } from '../serializer';

@Entity()
export class Blog extends BaseEntity {
  extractContent(content: string): string {
    // Extracted content logic
  }
  @PrimaryGeneratedColumn("uuid")
  id: number;

  @Column()
  @Expose()
  @MinLength(0)
  content: string;
}

export class BlogSerializer extends Serializer<typeof Blog> {
  entity = Blog;
  fields = ["id", "content"];
}
