import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMenu } from './menu'
import {
  EmptyState,
  errorMessage,
  formatDateTime,
  formatMoney,
  NativeSelect,
  PageError,
  PageShell,
  useUserRole,
} from './shared'
import { OrderDialogSplit } from './OrderDialogSplit'
import { supabase } from '@/lib/supabase'

type OrderStatus = 'pendiente' | 'preparacion' | 'listo' | 'entregado' | 'pagado' | 'cancelado'
type OrderType = 'local' | 'llevar' | 'delivery'
type Order = {
  id: string
  order_number: number
  order_type: OrderType
  status: OrderStatus
  total: number
  created_at: string
  customer_name: string | null
  table_id: string | null
  restaurant_tables: { name: string } | null
}
type Table = { id: string; name: string; status: string }

const statusLabels: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  pagado: 'Pagado',
  cancelado: 'Cancelado',
}

const activeStatuses: OrderStatus[] = ['pendiente', 'preparacion', 'listo', 'entregado']

function allowedTransitions(status: OrderStatus, isAdmin: boolean): OrderStatus[] {
  const map: Record<OrderStatus, OrderStatus[]> = {
    pendiente: ['preparacion', 'listo', 'entregado', 'pagado'],
    preparacion: ['listo', 'entregado', 'pagado'],
    listo: ['entregado', 'pagado'],
    entregado: ['pagado'],
    pagado: [],
    cancelado: [],
  }
  const list = map[status]
  return isAdmin && activeStatuses.includes(status) ? [...list, 'cancelado'] : list
}

export function OrdersPage() {
  const queryClient = useQueryClient()
  const role = useUserRole()
  const menu = useMenu()
  const [filter, setFilter] = useState<'activos' | 'todos'>('activos')
  const [createOpen, setCreateOpen] = useState(false)
  const [appendOrder, setAppendOrder] = useState<Order | null>(null)

  const ordersQuery = useQuery({
    queryKey: ['orders', filter],
    queryFn: async () => {
      let builder = supabase
        .from('orders')
        .select('id, order_number, order_type, status, total, created_at, customer_name, table_id, restaurant_tables(name)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (filter === 'activos') builder = builder.in('status', activeStatuses)
      const { data, error } = await builder
      if (error) throw error
      return (data ?? []) as unknown as Order[]
    },
    refetchInterval: 30_000,
  })

  const tablesQuery = useQuery({
    queryKey: ['restaurant-tables'],
    queryFn: async () => {
      const { data, error } = await supabase.from('restaurant_tables').select('id, name, status').order('name')
      if (error) throw error
      return (data ?? []) as Table[]
    },
    refetchInterval: 30_000,
  })

  useEffect(() => {
    const channel = supabase
      .channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['orders'] })
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [queryClient])

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] })
    void queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
  }

  const updateStatus = useMutation({
    mutationFn: async ({ order, status }: { order: Order; status: OrderStatus }) => {
      const { error } = await supabase.rpc('transition_order', {
        p_order_id: order.id,
        p_next_status: status,
        p_payment_method: status === 'pagado' ? 'efectivo' : null,
      })
      if (error) throw new Error(error.message)
    },
    onMutate: async ({ order, status }) => {
      await queryClient.cancelQueries({ queryKey: ['orders'] })
      const previousOrders = queryClient.getQueryData<Order[]>(['orders', filter])
      queryClient.setQueryData<Order[]>(['orders', filter], (old) =>
        old?.map((o) => (o.id === order.id ? { ...o, status } : o)) ?? []
      )
      return { previousOrders }
    },
    onError: (error, _variables, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(['orders', filter], context.previousOrders)
      }
      toast.error(errorMessage(error))
    },
    onSuccess: () => {
      invalidateAll()
      toast.success('Estado del pedido actualizado')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  if (menu.isPending || ordersQuery.isPending || tablesQuery.isPending) {
    return (
      <PageShell title='Pedidos' description='Seguimiento de pedidos y cobros'>
        <div className='grid gap-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className='flex flex-wrap items-center justify-between gap-4 p-4'>
                <div className='min-w-48 flex-1'>
                  <Skeleton className='h-4 w-3/4' />
                  <Skeleton className='h-3 w-1/2 mt-2' />
                </div>
                <div className='flex flex-wrap items-center gap-3'>
                  <Skeleton className='h-8 w-24' />
                  <Skeleton className='h-8 w-20' />
                  <Skeleton className='h-8 w-24' />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageShell>
    )
  }
  if (menu.error) return <PageShell title='Pedidos'><PageError message={errorMessage(menu.error)} /></PageShell>
  if (ordersQuery.error) return <PageShell title='Pedidos'><PageError message={errorMessage(ordersQuery.error)} /></PageShell>
  if (tablesQuery.error) return <PageShell title='Pedidos'><PageError message={errorMessage(tablesQuery.error)} /></PageShell>

  const canCreate = role.data === 'admin' || role.data === 'mesero'
  const isAdmin = role.data === 'admin'
  const { orders } = ordersQuery.data ? { orders: ordersQuery.data } : { orders: [] }

  return (
    <PageShell
      title='Pedidos'
      description={`${orders.length} pedidos ${filter === 'activos' ? 'activos' : 'recientes'}`}
      action={canCreate ? (
        <Button onClick={() => setCreateOpen(true)}><Plus /> Nuevo pedido</Button>
      ) : undefined}
    >
      <div className='flex flex-wrap gap-2'>
        <Button variant={filter === 'activos' ? 'default' : 'outline'} onClick={() => setFilter('activos')}>Activos</Button>
        <Button variant={filter === 'todos' ? 'default' : 'outline'} onClick={() => setFilter('todos')}>Todos</Button>
        <Button variant='ghost' size='icon' aria-label='Actualizar pedidos' onClick={() => void ordersQuery.refetch()}><RefreshCw className='size-4' /></Button>
      </div>

      {!orders.length ? (
        <EmptyState title='No hay pedidos para mostrar' description='Los pedidos creados aparecerán aquí.' />
      ) : (
        <div className='grid gap-3'>
          {orders.map((order) => {
            const transitions = allowedTransitions(order.status, isAdmin)
            return (
              <Card key={order.id}>
                <CardContent className='flex flex-wrap items-center justify-between gap-4 p-4'>
                  <div className='min-w-48 flex-1'>
                    <div className='font-semibold'>Pedido #{order.order_number}{order.restaurant_tables?.name ? ` · ${order.restaurant_tables.name}` : ''}</div>
                    <p className='mt-1 text-sm text-muted-foreground'>{order.customer_name || order.order_type} · {formatDateTime(order.created_at)}</p>
                  </div>
                  <div className='flex flex-wrap items-center gap-3'>
                    {canCreate && activeStatuses.includes(order.status) && (
                      <Button size='sm' variant='secondary' className='min-h-[44px]' onClick={() => setAppendOrder(order)}><Plus className='size-4' /> Agregar platos</Button>
                    )}
                    <span className='font-semibold'>{formatMoney(order.total)}</span>
                    {role.data === 'cocina' ? (
                      <span className='rounded-full bg-muted px-3 py-1 text-xs min-h-[44px] flex items-center'>{statusLabels[order.status]}</span>
                    ) : transitions.length ? (
                      <NativeSelect
                        className='w-auto min-w-36 min-h-[44px]'
                        aria-label={`Estado del pedido ${order.order_number}`}
                        value={order.status}
                        onChange={(event) => updateStatus.mutate({ order, status: event.target.value as OrderStatus })}
                      >
                        <option value={order.status}>{statusLabels[order.status]}</option>
                        {transitions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                      </NativeSelect>
                    ) : (
                      <Badge variant='secondary' className='min-h-[44px] flex items-center'>{statusLabels[order.status]}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {createOpen && (
        <OrderDialogSplit
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode='create'
          menu={menu.data}
          tables={tablesQuery.data}
          onDone={invalidateAll}
        />
      )}

      {appendOrder && (
        <OrderDialogSplit
          key={appendOrder.id}
          open={Boolean(appendOrder)}
          onOpenChange={(open) => !open && setAppendOrder(null)}
          mode='append'
          order={appendOrder}
          menu={menu.data}
          tables={tablesQuery.data}
          onDone={invalidateAll}
        />
      )}
    </PageShell>
  )
}