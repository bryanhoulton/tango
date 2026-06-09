import { f, model } from '@tango-ts/orm'
import { describe, expect, it } from 'vitest'

import {
  buildSnapshot,
  diffSnapshots,
  emptySnapshot,
  renderOperation,
  renderOperations
} from '../src/index.js'
import type { ColumnSnapshot } from '../src/index.js'

const ageNullable: ColumnSnapshot = {
  name: 'age',
  type: 'int',
  nullable: true,
  hasDefault: false,
  autoIncrement: false,
  primaryKey: false,
  unique: false
}

describe('renderOperation', () => {
  it('renders createTable with pk and unique constraint', () => {
    const User = model('users', {
      id: f.int().primaryKey().autoIncrement(),
      email: f.varchar(255).unique(),
      age: f.int().nullable()
    })
    const target = buildSnapshot([User])
    const ops = diffSnapshots(emptySnapshot(), target)
    const rendered = renderOperations(ops)
    expect(rendered.up).toEqual([
      'CREATE TABLE `users` (`id` int NOT NULL AUTO_INCREMENT, `email` varchar(255) NOT NULL, `age` int NULL, PRIMARY KEY (`id`), UNIQUE `users_email_uniq` (`email`))'
    ])
    expect(rendered.down).toEqual(['DROP TABLE `users`'])
  })

  it('renders addColumn forward and reverse', () => {
    const rendered = renderOperation({
      kind: 'addColumn',
      table: 'users',
      column: ageNullable
    })
    expect(rendered.up).toEqual([
      'ALTER TABLE `users` ADD COLUMN `age` int NULL'
    ])
    expect(rendered.down).toEqual(['ALTER TABLE `users` DROP COLUMN `age`'])
  })

  it('renders alterColumn as MODIFY in both directions', () => {
    const ageNotNull: ColumnSnapshot = { ...ageNullable, nullable: false }
    const rendered = renderOperation({
      kind: 'alterColumn',
      table: 'users',
      from: ageNullable,
      to: ageNotNull
    })
    expect(rendered.up).toEqual([
      'ALTER TABLE `users` MODIFY COLUMN `age` int NOT NULL'
    ])
    expect(rendered.down).toEqual([
      'ALTER TABLE `users` MODIFY COLUMN `age` int NULL'
    ])
  })

  it('renders renameColumn', () => {
    const rendered = renderOperation({
      kind: 'renameColumn',
      table: 'users',
      from: 'name',
      to: 'full_name'
    })
    expect(rendered.up).toEqual([
      'ALTER TABLE `users` RENAME COLUMN `name` TO `full_name`'
    ])
    expect(rendered.down).toEqual([
      'ALTER TABLE `users` RENAME COLUMN `full_name` TO `name`'
    ])
  })

  it('renders addUnique / dropUnique with a deterministic name', () => {
    const add = renderOperation({
      kind: 'addUnique',
      table: 'users',
      columns: ['email']
    })
    expect(add.up).toEqual([
      'ALTER TABLE `users` ADD UNIQUE `users_email_uniq` (`email`)'
    ])
    expect(add.down).toEqual([
      'ALTER TABLE `users` DROP INDEX `users_email_uniq`'
    ])
  })

  it('renders addForeignKey / dropForeignKey', () => {
    const rendered = renderOperation({
      kind: 'addForeignKey',
      table: 'posts',
      foreignKey: {
        name: 'posts_authorId_fk',
        columns: ['authorId'],
        referencesTable: 'authors',
        referencesColumns: ['id'],
        onDelete: 'cascade'
      }
    })
    expect(rendered.up).toEqual([
      'ALTER TABLE `posts` ADD CONSTRAINT `posts_authorId_fk` FOREIGN KEY (`authorId`) REFERENCES `authors` (`id`) ON DELETE CASCADE'
    ])
    expect(rendered.down).toEqual([
      'ALTER TABLE `posts` DROP FOREIGN KEY `posts_authorId_fk`'
    ])
  })

  it('reverses a multi-operation migration back-to-front', () => {
    const ops = [
      { kind: 'addColumn' as const, table: 'users', column: ageNullable },
      {
        kind: 'renameColumn' as const,
        table: 'users',
        from: 'name',
        to: 'full_name'
      }
    ]
    const rendered = renderOperations(ops)
    expect(rendered.up).toEqual([
      'ALTER TABLE `users` ADD COLUMN `age` int NULL',
      'ALTER TABLE `users` RENAME COLUMN `name` TO `full_name`'
    ])
    expect(rendered.down).toEqual([
      'ALTER TABLE `users` RENAME COLUMN `full_name` TO `name`',
      'ALTER TABLE `users` DROP COLUMN `age`'
    ])
  })
})
