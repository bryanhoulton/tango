import { detailResponse, jsonResponse, type RequestContext } from '@tango-ts/http'
import { defineRoutes, route } from '@tango-ts/router'
import { modelViewSet } from '@tango-ts/views'

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
import {
  AccountSerializer,
  DocumentSerializer,
  InventoryItemSerializer,
  InvoiceSerializer,
  MessageSerializer,
  NoteSerializer,
  OrderSerializer,
  PaymentSerializer,
  ProjectSerializer,
  UserSerializer
} from './serializers.js'

function authUser(ctx: RequestContext): { readonly id: number; readonly role: string } | undefined {
  const token = ctx.request.headers.get('authorization')
  if (token === 'Bearer owner') {
    return { id: 1, role: 'owner' }
  }
  if (token === 'Bearer admin') {
    return { id: 2, role: 'admin' }
  }
  if (token === 'Bearer reader') {
    return { id: 3, role: 'reader' }
  }
  return undefined
}

function requireAuth(ctx: RequestContext): boolean {
  return ctx.user !== undefined
}

function me(): Response {
  return jsonResponse({ id: 'me', email: 'me@example.com' })
}

async function ready(): Promise<Response> {
  await User.objects.all().fetch()
  return jsonResponse({ ok: true, database: 'ready' })
}

async function exportOrdersCsv(): Promise<Response> {
  const orders = await Order.objects.all().fetch()
  const rows = ['id,customerId,status,total']
  for (const order of orders) {
    rows.push(`${order.id},${order.customerId},${order.status},${order.total}`)
  }
  return new Response(`${rows.join('\n')}\n`, {
    headers: {
      'content-type': 'text/csv',
      'content-disposition': 'attachment; filename="orders.csv"'
    }
  })
}

async function createMessage(ctx: RequestContext): Promise<Response> {
  const payload = await ctx.json()
  const serializer = MessageSerializer.forUnknownInput(payload)
  if (!serializer.isValid()) {
    return jsonResponse(serializer.errors, { status: 400 })
  }
  const row = await serializer.save()
  return jsonResponse(MessageSerializer.serialize(row), { status: 201 })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function searchMessages(ctx: RequestContext): Promise<Response> {
  const payload = await ctx.json()
  if (!isRecord(payload)) {
    return detailResponse('Expected object.', 400)
  }
  const term = payload['term']
  if (typeof term !== 'string') {
    return detailResponse('Expected search term.', 400)
  }
  const rows = await Message.objects.filter({ text__icontains: term }).fetch()
  return jsonResponse(rows.map((row) => MessageSerializer.serialize(row)))
}

export const routes = defineRoutes([
  route(
    '/users',
    modelViewSet({
      model: User,
      serializer: UserSerializer,
      filters: ['age__gte', 'name__icontains'] as const,
      pagination: { pageSize: 2, maxPageSize: 5 }
    })
  ),
  route('GET', '/users/me/', me),
  route('/accounts', modelViewSet({ model: Account, serializer: AccountSerializer })),
  route('/projects', modelViewSet({ model: Project, serializer: ProjectSerializer })),
  route('/notes', modelViewSet({ model: Note, serializer: NoteSerializer })),
  route(
    '/users/:userId/projects/:projectId/notes',
    modelViewSet({ model: Note, serializer: NoteSerializer })
  ),
  route(
    '/orders',
    modelViewSet({
      model: Order,
      serializer: OrderSerializer,
      filters: ['status', 'customerId', 'createdAt__gte', 'createdAt__lte'] as const,
      pagination: { pageSize: 2, maxPageSize: 5 }
    })
  ),
  route('GET', '/orders/export.csv', exportOrdersCsv),
  route(
    '/documents',
    modelViewSet({
      model: Document,
      serializer: DocumentSerializer,
      authenticate: authUser,
      permissions: [requireAuth]
    })
  ),
  route('/invoices', modelViewSet({ model: Invoice, serializer: InvoiceSerializer })),
  route('/payments', modelViewSet({ model: Payment, serializer: PaymentSerializer })),
  route(
    '/inventory',
    modelViewSet({ model: InventoryItem, serializer: InventoryItemSerializer })
  ),
  route('/v1/customers', modelViewSet({ model: Account, serializer: AccountSerializer })),
  route('/v2/customers', modelViewSet({ model: Account, serializer: AccountSerializer })),
  route('/messages', modelViewSet({ model: Message, serializer: MessageSerializer })),
  route('POST', '/messages/', createMessage),
  route('POST', '/messages/search/', searchMessages),
  route('GET', '/health/live/', () => jsonResponse({ ok: true })),
  route('GET', '/health/ready/', ready)
])

export default routes
