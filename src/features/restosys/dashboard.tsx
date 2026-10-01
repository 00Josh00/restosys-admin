import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import {
  EmptyState,
  errorMessage,
  formatDateTime,
  formatMoney,
  MetricCard,
  PageError,
  PageLoading,
  PageShell,
} from './shared'

type DashboardOrder = {
  id: string
  order_number: number
  order_type: string
  status: string
  total: number
  created_at: string
  restaurant_tables: { name: string } | null
}

export function DashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const dayStart = today.toISOString()
      const date = today.toLocaleDateString('en-CA')
      const [ordersResult, tablesResult, expensesResult] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, order_type, status, total, created_at, restaurant_tables(name)')
          .gte('created_at', dayStart)
          .order('created_at', { ascending: false }),
        supabase.from('restaurant_tables').select('id, status'),
        supabase.from('expenses').select('amount').eq('expense_date', date),
      ])
      const error = ordersResult.error ?? tablesResult.error ?? expensesResult.error
      if (error) throw error
      return {
        orders: (ordersResult.data ?? []) as unknown as DashboardOrder[],
        tables: tablesResult.data ?? [],
        expenses: expensesResult.data ?? [],
      }
    },
    refetchInterval: 60_000,
  })

  if (query.isPending) {
    return <PageShell title='Panel' description='Resumen de la operación de hoy'><PageLoading /></PageShell>
  }
  if (query.error) {
    return <PageShell title='Panel' description='Resumen de la operación de hoy'><PageError message={errorMessage(query.error)} /></PageShell>
  }

  const orders = query.data.orders
  const sales = orders
    .filter((order) => order.status === 'pagado')
    .reduce((sum, order) => sum + Number(order.total), 0)
  const activeOrders = orders.filter((order) => !['pagado', 'cancelado'].includes(order.status)).length
  const occupiedTables = query.data.tables.filter((table) => table.status === 'ocupada').length
  const expenses = query.data.expenses.reduce((sum, item) => sum + Number(item.amount), 0)

  return (
    <PageShell
      title='Panel'
      description={`Resumen del ${new Intl.DateTimeFormat('es-PE', { dateStyle: 'full' }).format(new Date())}`}
    >
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <MetricCard title='Ventas cobradas hoy' value={formatMoney(sales)} detail='Pedidos marcados como pagados' />
        <MetricCard title='Pedidos abiertos' value={activeOrders} detail={`${orders.length} pedidos registrados hoy`} />
        <MetricCard title='Mesas ocupadas' value={occupiedTables} detail={`de ${query.data.tables.length} mesas`} />
        <MetricCard title='Gastos de hoy' value={formatMoney(expenses)} detail='Registrados en caja' />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actividad de hoy</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <EmptyState title='Todavía no hay pedidos hoy' description='Los pedidos nuevos aparecerán aquí.' />
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full min-w-[620px] text-sm'>
                <thead>
                  <tr className='border-b text-left text-muted-foreground'>
                    <th className='pb-3 font-medium'>Pedido</th>
                    <th className='pb-3 font-medium'>Tipo</th>
                    <th className='pb-3 font-medium'>Hora</th>
                    <th className='pb-3 font-medium'>Estado</th>
                    <th className='pb-3 text-right font-medium'>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 8).map((order) => (
                    <tr className='border-b last:border-0' key={order.id}>
                      <td className='py-3 font-medium'>#{order.order_number}{order.restaurant_tables?.name ? ` · ${order.restaurant_tables.name}` : ''}</td>
                      <td className='py-3 capitalize'>{order.order_type}</td>
                      <td className='py-3 text-muted-foreground'>{formatDateTime(order.created_at)}</td>
                      <td className='py-3 capitalize'>{order.status.replace('_', ' ')}</td>
                      <td className='py-3 text-right font-medium'>{formatMoney(order.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
