import { createFileRoute } from '@tanstack/react-router'
import { ReportsPage } from '@/features/restosys/reports'

export const Route = createFileRoute('/_authenticated/reportes/')({
  component: ReportsPage,
})
