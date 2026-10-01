import { createFileRoute } from '@tanstack/react-router'
import { TeamPage } from '@/features/restosys/team'

export const Route = createFileRoute('/_authenticated/equipo/')({
  component: TeamPage,
})
