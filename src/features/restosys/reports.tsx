import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  EmptyState,
  errorMessage,
  formatMoney,
  MetricCard,
  PageError,
  PageLoading,
  PageShell,
  useUserRole,
} from './shared'

type ReportOrder = {
  id: string
  total: number
  delivery_fee: number
  order_type: 'local' | 'llevar' | 'delivery'
  status: string
  created_at: string
  order_items: { product_name: string; quantity: number; subtotal: number }[]
}

const typeLabels = {
  local: 'En local',
  llevar: 'Para llevar',
  delivery: 'Delivery',
} as const

function startOfMonth() {
  const date = new Date()
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function ReportsPage() {
  const role = useUserRole()
  const query = useQuery({
    queryKey: ['reports'],
    enabled: role.data === 'admin',
    queryFn: async () => {
      const monthStart = startOfMonth().toISOString()
      const dateStart = startOfMonth().toLocaleDateString('en-CA')
      const [ordersResult, expensesResult] = await Promise.all([
        supabase
          .from('orders')
          .select(
            'id, total, delivery_fee, order_type, status, created_at, order_items(product_name, quantity, subtotal)'
          )
          .gte('created_at', monthStart),
        supabase
          .from('expenses')
          .select('amount')
          .gte('expense_date', dateStart),
      ])
      const error = ordersResult.error ?? expensesResult.error
      if (error) throw error
      return {
        orders: ((ordersResult.data ?? []) as unknown as ReportOrder[]).filter(
          (order) => order.status !== 'cancelado'
        ),
        expenses: expensesResult.data ?? [],
      }
    },
  })

  if (role.isPending)
    return (
      <PageShell title='Reportes' description='Resumen del negocio'>
        <PageLoading />
      </PageShell>
    )
  if (role.data !== 'admin') {
    return (
      <PageShell title='Reportes' description='Resumen del negocio'>
        <EmptyState
          title='Solo administradores'
          description='No tienes permiso para ver esta sección.'
        />
      </PageShell>
    )
  }
  if (query.isPending)
    return (
      <PageShell title='Reportes' description='Resumen del negocio'>
        <PageLoading />
      </PageShell>
    )
  if (query.error)
    return (
      <PageShell title='Reportes'>
        <PageError message={errorMessage(query.error)} />
      </PageShell>
    )

  const orders = query.data.orders
  const salesMonth = orders.reduce((sum, order) => sum + Number(order.total), 0)
  const expensesMonth = query.data.expenses.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  )
  const delivery = orders.reduce(
    (sum, order) => sum + Number(order.delivery_fee),
    0
  )
  const net = salesMonth - expensesMonth

  const byType = (['local', 'llevar', 'delivery'] as const).map((type) => {
    const subset = orders.filter((order) => order.order_type === type)
    return {
      type,
      count: subset.length,
      total: subset.reduce((sum, order) => sum + Number(order.total), 0),
    }
  })

  const productMap = new Map<string, { quantity: number; total: number }>()
  for (const order of orders) {
    for (const item of order.order_items ?? []) {
      const current = productMap.get(item.product_name) ?? {
        quantity: 0,
        total: 0,
      }
      current.quantity += item.quantity
      current.total += Number(item.subtotal)
      productMap.set(item.product_name, current)
    }
  }
  const topProducts = [...productMap.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 6)

  const byDay = new Map<string, number>()
  for (const order of orders) {
    const day = order.created_at.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + Number(order.total))
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const maxDay = Math.max(1, ...days.map(([, value]) => value))

  return (
    <PageShell
      title='Reportes'
      description='Resumen de ventas, gastos y balance del mes'
    >
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          title='Ventas del mes'
          value={formatMoney(salesMonth)}
          detail={`${orders.length} pedidos`}
        />
        <MetricCard title='Gastos del mes' value={formatMoney(expensesMonth)} />
        <MetricCard title='Delivery cobrado' value={formatMoney(delivery)} />
        <MetricCard
          title='Balance neto'
          value={formatMoney(net)}
          detail={net >= 0 ? 'Resultado positivo' : 'Resultado negativo'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Ventas por día</CardTitle>
        </CardHeader>
        <CardContent>
          {!days.length ? (
            <EmptyState title='Sin ventas registradas este mes' />
          ) : (
            <div className='flex h-48 items-end gap-2 overflow-x-auto'>
              {days.map(([day, value]) => (
                <div
                  key={day}
                  className='flex min-w-10 flex-1 flex-col items-center gap-2'
                >
                  <div className='flex h-36 w-full items-end'>
                    <div
                      className='w-full rounded-t bg-primary/80'
                      style={{
                        height: `${Math.max(4, (value / maxDay) * 100)}%`,
                      }}
                      title={formatMoney(value)}
                    />
                  </div>
                  <span className='text-xs text-muted-foreground'>
                    {day.slice(8)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Por tipo de pedido</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {byType.map((item) => (
              <div
                key={item.type}
                className='flex items-center justify-between text-sm'
              >
                <span>
                  {typeLabels[item.type]}{' '}
                  <span className='text-muted-foreground'>({item.count})</span>
                </span>
                <span className='font-medium'>{formatMoney(item.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Platos más vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            {!topProducts.length ? (
              <EmptyState title='Sin ventas registradas' />
            ) : (
              <div className='space-y-3'>
                {topProducts.map((product, index) => (
                  <div
                    key={product.name}
                    className='flex items-center justify-between text-sm'
                  >
                    <span>
                      <span className='text-muted-foreground'>
                        {index + 1}.
                      </span>{' '}
                      {product.name}
                    </span>
                    <span>
                      <strong>{product.quantity}</strong>{' '}
                      <span className='text-muted-foreground'>
                        {formatMoney(product.total)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
