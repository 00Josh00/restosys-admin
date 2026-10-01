import { createFileRoute } from '@tanstack/react-router'
import { KitchenPage } from '@/features/restosys/kitchen'

export const Route = createFileRoute('/_authenticated/cocina/')({
  component: KitchenPage,
})
