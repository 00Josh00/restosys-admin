import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/features/restosys/dashboard'

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardPage,
})
