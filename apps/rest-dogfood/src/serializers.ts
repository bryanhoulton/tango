import { modelSerializer } from '@tango-ts/serializers'

import {
  Account,
  Document,
  InventoryItem,
  Invoice,
  Message,
  Note,
  Order,
  Payment,
  Project,
  User
} from './models.js'

export const UserSerializer = modelSerializer(User, {
  fields: ['id', 'email', 'name', 'age', 'isStaff'] as const,
  readOnlyFields: ['id', 'isStaff'] as const
})

export const ProjectSerializer = modelSerializer(Project, {
  fields: ['id', 'userId', 'name'] as const,
  readOnlyFields: ['id'] as const
})

export const NoteSerializer = modelSerializer(Note, {
  fields: ['id', 'projectId', 'title', 'body', 'isArchived'] as const,
  readOnlyFields: ['id', 'isArchived'] as const
})

export const AccountSerializer = modelSerializer(Account, {
  fields: ['id', 'email', 'displayName', 'createdAt'] as const,
  readOnlyFields: ['id', 'createdAt'] as const
})

export const OrderSerializer = modelSerializer(Order, {
  fields: ['id', 'customerId', 'status', 'total', 'createdAt'] as const,
  readOnlyFields: ['id'] as const
})

export const DocumentSerializer = modelSerializer(Document, {
  fields: ['id', 'ownerId', 'title', 'visibility', 'body'] as const,
  readOnlyFields: ['id'] as const
})

export const InvoiceSerializer = modelSerializer(Invoice, {
  fields: ['id', 'tenantId', 'number', 'amount'] as const,
  readOnlyFields: ['id', 'tenantId'] as const
})

export const PaymentSerializer = modelSerializer(Payment, {
  fields: ['id', 'tenantId', 'idempotencyKey', 'amount', 'status'] as const,
  readOnlyFields: ['id', 'tenantId', 'status'] as const
})

export const InventoryItemSerializer = modelSerializer(InventoryItem, {
  fields: ['id', 'sku', 'quantity'] as const,
  readOnlyFields: ['id'] as const
})

export const MessageSerializer = modelSerializer(Message, {
  fields: ['id', 'text'] as const,
  readOnlyFields: ['id'] as const
})
