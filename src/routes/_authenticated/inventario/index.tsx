import { createFileRoute } from '@tanstack/react-router'
import { InventoryPage } from '@/features/restosys/inventory'

export const Route = createFileRoute('/_authenticated/inventario/')({
  component: InventoryPage,
})
