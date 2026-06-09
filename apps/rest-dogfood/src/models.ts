import { f, model } from '@tango-ts/orm'

export const User = model('rest_users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  name: f.varchar(255),
  age: f.int().nullable(),
  isStaff: f.boolean().default(false)
})

export const Project = model('rest_projects', {
  id: f.int().primaryKey().autoIncrement(),
  userId: f.foreignKey(() => User, 'id', { onDelete: 'cascade' }),
  name: f.varchar(255)
})

export const Note = model('rest_notes', {
  id: f.int().primaryKey().autoIncrement(),
  projectId: f.foreignKey(() => Project, 'id', { onDelete: 'cascade' }),
  title: f.varchar(255),
  body: f.text(),
  isArchived: f.boolean().default(false)
})

export const Account = model('rest_accounts', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  displayName: f.varchar(255),
  passwordHash: f.varchar(255),
  apiKeyHash: f.varchar(255).nullable(),
  isStaff: f.boolean().default(false),
  deletedAt: f.datetime().nullable(),
  createdAt: f.datetime().autoNowAdd()
})

export const Order = model('rest_orders', {
  id: f.int().primaryKey().autoIncrement(),
  customerId: f.int(),
  status: f.varchar(32),
  total: f.float(),
  createdAt: f.datetime()
})

export const Document = model('rest_documents', {
  id: f.int().primaryKey().autoIncrement(),
  ownerId: f.foreignKey(() => User, 'id', { onDelete: 'cascade' }),
  title: f.varchar(255),
  visibility: f.varchar(32),
  body: f.text()
})

export const Invoice = model('rest_invoices', {
  id: f.int().primaryKey().autoIncrement(),
  tenantId: f.varchar(64),
  number: f.varchar(64),
  amount: f.float()
})

export const Payment = model('rest_payments', {
  id: f.int().primaryKey().autoIncrement(),
  tenantId: f.varchar(64),
  idempotencyKey: f.varchar(255).unique(),
  payloadHash: f.varchar(255),
  amount: f.float(),
  status: f.varchar(32)
})

export const InventoryItem = model('rest_inventory_items', {
  id: f.int().primaryKey().autoIncrement(),
  sku: f.varchar(64).unique(),
  quantity: f.int()
})

export const Message = model('rest_messages', {
  id: f.int().primaryKey().autoIncrement(),
  text: f.text()
})

export const models = [
  User,
  Project,
  Note,
  Account,
  Order,
  Document,
  Invoice,
  Payment,
  InventoryItem,
  Message
] as const
