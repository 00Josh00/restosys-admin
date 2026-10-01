import { createFileRoute } from '@tanstack/react-router'
import { TablesPage } from '@/features/restosys/tables'

export const Route = createFileRoute('/_authenticated/mesas/')({
  component: TablesPage,
})
