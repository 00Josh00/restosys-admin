import { createFileRoute } from '@tanstack/react-router'
import { OrdersPage } from '@/features/restosys/orders'

export const Route = createFileRoute('/_authenticated/pedidos/')({
  component: OrdersPage,
})
