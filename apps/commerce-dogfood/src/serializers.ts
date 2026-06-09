import { modelSerializer } from '@tango-ts/serializers'

import { Customer, InventoryItem, Order, Payment } from './models.js'

export const CustomerSerializer = modelSerializer(Customer, {
  fields: ['id', 'email', 'name'] as const,
  readOnlyFields: ['id'] as const
})

export const InventoryItemSerializer = modelSerializer(InventoryItem, {
  fields: ['id', 'sku', 'quantity'] as const,
  readOnlyFields: ['id'] as const
})

export const OrderSerializer = modelSerializer(Order, {
  fields: ['id', 'customerId', 'status', 'total'] as const,
  readOnlyFields: ['id', 'status'] as const
})

export const PaymentSerializer = modelSerializer(Payment, {
  fields: ['id', 'orderId', 'idempotencyKey', 'amount', 'status'] as const,
  readOnlyFields: ['id', 'status'] as const
})
