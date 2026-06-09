import { defineRoutes, route } from '@tango-ts/router'
import { modelViewSet } from '@tango-ts/views'

import { Customer, InventoryItem, Order, Payment } from './models.js'
import {
  CustomerSerializer,
  InventoryItemSerializer,
  OrderSerializer,
  PaymentSerializer
} from './serializers.js'

export const routes = defineRoutes([
  route('/customers', modelViewSet({ model: Customer, serializer: CustomerSerializer })),
  route(
    '/inventory',
    modelViewSet({ model: InventoryItem, serializer: InventoryItemSerializer })
  ),
  route('/orders', modelViewSet({ model: Order, serializer: OrderSerializer })),
  route('/payments', modelViewSet({ model: Payment, serializer: PaymentSerializer }))
])

export default routes
