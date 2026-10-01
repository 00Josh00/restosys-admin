import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChefHat, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  errorMessage,
  formatDateTime,
  formatMoney,
  PageError,
  PageLoading,
  PageShell,
} from './shared'

type KitchenOrder = {
  id: string
  order_number: number
  order_type: string
  status: 'pendiente' | 'preparacion' | 'listo'
  total: number
  notes: string | null
  created_at: string
  restaurant_tables: { name: string } | null
  order_items: {
    product_name: string
    quantity: number
    notes: string | null
    order_item_components: { product_name: string; position: number }[]
  }[]
}

export function KitchenPage() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['kitchen-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_number, order_type, status, total, notes, created_at, restaurant_tables(name), order_items(product_name, quantity, notes, order_item_components(product_name, position))'
        )
        .in('status', ['pendiente', 'preparacion', 'listo'])
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as KitchenOrder[]
    },
  })

  useEffect(() => {
    const channel = supabase
      .channel('kitchen-queue')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['kitchen-queue'] })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['kitchen-queue'] })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])

  const setStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: KitchenOrder['status']
    }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['kitchen-queue'] }),
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (query.isPending)
    return (
      <PageShell
        title='Cocina'
        description='Cola de preparación en tiempo real'
      >
        <PageLoading />
      </PageShell>
    )
  if (query.error)
    return (
      <PageShell title='Cocina'>
        <PageError message={errorMessage(query.error)} />
      </PageShell>
    )

  const queue = query.data
  const pending = queue.filter((order) => order.status === 'pendiente')
  const preparing = queue.filter((order) => order.status === 'preparacion')
  const ready = queue.filter((order) => order.status === 'listo')

  return (
    <PageShell
      title='Cocina'
      description={`${queue.length} pedidos en cola · Actualización en tiempo real`}
    >
      {!queue.length ? (
        <Card>
          <CardContent className='flex min-h-48 flex-col items-center justify-center gap-2 text-center'>
            <ChefHat className='size-8 text-muted-foreground' />
            <p className='font-medium'>La cola está despejada</p>
            <p className='text-sm text-muted-foreground'>
              Los nuevos pedidos aparecerán aquí.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className='grid items-start gap-5 xl:grid-cols-3'>
          <KitchenColumn
            title='Pendientes'
            orders={pending}
            nextLabel='Iniciar preparación'
            nextStatus='preparacion'
            onAdvance={(id, status) => setStatus.mutate({ id, status })}
          />
          <KitchenColumn
            title='En preparación'
            orders={preparing}
            nextLabel='Marcar listo'
            nextStatus='listo'
            onAdvance={(id, status) => setStatus.mutate({ id, status })}
          />
          <KitchenColumn
            title='Listos'
            orders={ready}
            nextLabel='Entregado'
            nextStatus='listo'
            onAdvance={(id) => setStatus.mutate({ id, status: 'listo' })}
          />
        </div>
      )}
    </PageShell>
  )
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function KitchenColumn({
  title,
  orders,
  nextLabel,
  nextStatus,
  onAdvance,
}: {
  title: string
  orders: KitchenOrder[]
  nextLabel: string
  nextStatus: KitchenOrder['status']
  onAdvance: (id: string, status: KitchenOrder['status']) => void
}) {
  const now = useNow()
  return (
    <section className='grid gap-3'>
      <div className='flex items-center justify-between'>
        <h2 className='font-semibold'>{title}</h2>
        <Badge variant='secondary'>{orders.length}</Badge>
      </div>
      {orders.map((order) => (
        <Card key={order.id}>
          <CardHeader className='pb-3'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <CardTitle className='text-base'>
                  #{order.order_number}
                  {order.restaurant_tables?.name
                    ? ` · ${order.restaurant_tables.name}`
                    : ''}
                </CardTitle>
                <p className='mt-1 text-xs text-muted-foreground capitalize'>
                  {order.order_type} · {formatDateTime(order.created_at)}
                </p>
              </div>
              <span className='flex items-center gap-1 text-xs text-muted-foreground'>
                <Timer className='size-3.5' />
                {now
                  ? Math.max(
                      0,
                      Math.floor(
                        (now - new Date(order.created_at).getTime()) / 60_000
                      )
                    )
                  : 0}{' '}
                min
              </span>
            </div>
          </CardHeader>
          <CardContent className='space-y-3'>
            <ul className='space-y-2 text-sm'>
              {order.order_items.map((item, index) => (
                <li
                  className='flex justify-between gap-3'
                  key={`${order.id}-${index}`}
                >
                  <span>
                    <strong>{item.quantity}×</strong> {item.product_name}
                    {item.order_item_components?.length > 0 && (
                      <span className='block text-xs text-muted-foreground'>
                        {[...item.order_item_components]
                          .sort((a, b) => a.position - b.position)
                          .map((component) => component.product_name)
                          .join(' + ')}
                      </span>
                    )}
                    {item.notes && (
                      <span className='block text-xs text-muted-foreground'>
                        {item.notes}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {order.notes && (
              <p className='rounded-md bg-amber-500/10 p-2 text-sm'>
                Nota: {order.notes}
              </p>
            )}
            <div className='flex items-center justify-between border-t pt-3'>
              <span className='text-sm text-muted-foreground'>
                {formatMoney(order.total)}
              </span>
              <Button size='sm' onClick={() => onAdvance(order.id, nextStatus)}>
                {order.status === 'pendiente' ? <ChefHat /> : <Check />}
                {nextLabel}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {orders.length === 0 && (
        <p className='rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground'>
          Sin pedidos
        </p>
      )}
    </section>
  )
}
