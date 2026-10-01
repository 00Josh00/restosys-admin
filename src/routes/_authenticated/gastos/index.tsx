import { createFileRoute } from '@tanstack/react-router'
import { ExpensesPage } from '@/features/restosys/expenses'

export const Route = createFileRoute('/_authenticated/gastos/')({
  component: ExpensesPage,
})
