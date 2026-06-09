import { f, model } from '@tango-ts/orm'

export const Customer = model('commerce_customers', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  name: f.varchar(255)
})

export const InventoryItem = model('commerce_inventory_items', {
  id: f.int().primaryKey().autoIncrement(),
  sku: f.varchar(64).unique(),
  quantity: f.int()
})

export const Order = model('commerce_orders', {
  id: f.int().primaryKey().autoIncrement(),
  customerId: f.foreignKey(() => Customer, 'id', { onDelete: 'restrict' }),
  status: f.varchar(32),
  total: f.float()
})

export const Payment = model('commerce_payments', {
  id: f.int().primaryKey().autoIncrement(),
  orderId: f.foreignKey(() => Order, 'id', { onDelete: 'cascade' }),
  idempotencyKey: f.varchar(255).unique(),
  payloadHash: f.varchar(255),
  amount: f.float(),
  status: f.varchar(32)
})

export const models = [Customer, InventoryItem, Order, Payment] as const
