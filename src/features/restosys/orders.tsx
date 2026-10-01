import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { EmptyState, errorMessage, FormField, formatDateTime, formatMoney, NativeSelect, PageError, PageLoading, PageShell, TextInput, useUserRole } from './shared'

type OrderStatus = 'pendiente' | 'preparacion' | 'listo' | 'entregado' | 'pagado' | 'cancelado'
type Order = {
  id: string
  order_number: number
  order_type: 'local' | 'llevar' | 'delivery'
  status: OrderStatus
  total: number
  created_at: string
  customer_name: string | null
  restaurant_tables: { name: string } | null
}
type Product = { id: string; name: string; price: number }
type Table = { id: string; name: string; status: string }
type CartLine = Product & { quantity: number }

const statusLabels: Record<OrderStatus, string> = {
  pendiente: 'Pendiente', preparacion: 'En preparación', listo: 'Listo',
  entregado: 'Entregado', pagado: 'Pagado', cancelado: 'Cancelado',
}

export function OrdersPage() {
  const queryClient = useQueryClient()
  const role = useUserRole()
  const user = useAuthStore((state) => state.auth.user)
  const [filter, setFilter] = useState<'activos' | 'todos'>('activos')
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState<CartLine[]>([])
  const query = useQuery({
    queryKey: ['orders', filter],
    queryFn: async () => {
      let ordersQuery = supabase
        .from('orders')
        .select('id, order_number, order_type, status, total, created_at, customer_name, restaurant_tables(name)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (filter === 'activos') ordersQuery = ordersQuery.in('status', ['pendiente', 'preparacion', 'listo', 'entregado'])
      const [ordersResult, productsResult, tablesResult] = await Promise.all([
        ordersQuery,
        supabase.from('products').select('id, name, price').eq('is_available', true).order('name'),
        supabase.from('restaurant_tables').select('id, name, status').order('name'),
      ])
      const error = ordersResult.error ?? productsResult.error ?? tablesResult.error
      if (error) throw error
      return {
        orders: (ordersResult.data ?? []) as unknown as Order[],
        products: (productsResult.data ?? []) as Product[],
        tables: (tablesResult.data ?? []) as Table[],
      }
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

  const updateStatus = useMutation({
    mutationFn: async ({ order, status }: { order: Order; status: OrderStatus }) => {
      const values: Record<string, unknown> = { status }
      if (status === 'pagado') {
        values.payment_method = 'efectivo'
        values.paid_at = new Date().toISOString()
      }
      const { error } = await supabase.from('orders').update(values).eq('id', order.id)
      if (error) throw error
      if (['pagado', 'cancelado'].includes(status) && order.restaurant_tables?.name) {
        const table = query.data?.tables.find((item) => item.name === order.restaurant_tables?.name)
        if (table) {
          const { error: tableError } = await supabase.from('restaurant_tables').update({ status: 'libre' }).eq('id', table.id)
          if (tableError) throw tableError
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
      toast.success('Estado del pedido actualizado')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0), [lines])

  const addOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    if (!lines.length) return toast.error('Agrega al menos un producto al pedido.')
    const orderType = String(data.get('order_type')) as Order['order_type']
    const tableId = String(data.get('table_id') || '')
    if (orderType === 'local' && !tableId) return toast.error('Selecciona una mesa.')
    const deliveryFee = orderType === 'delivery' ? Number(data.get('delivery_fee') || 0) : 0
    const { data: order, error } = await supabase.from('orders').insert({
      order_type: orderType,
      table_id: orderType === 'local' ? tableId : null,
      customer_name: String(data.get('customer_name') || '').trim() || null,
      delivery_address: orderType === 'delivery' ? String(data.get('delivery_address') || '').trim() || null : null,
      delivery_fee: deliveryFee,
      subtotal,
      total: subtotal + deliveryFee,
      notes: String(data.get('notes') || '').trim() || null,
      created_by: user?.id ?? null,
    }).select('id').single()
    if (error || !order) return toast.error(error?.message ?? 'No se pudo crear el pedido.')

    const { error: itemsError } = await supabase.from('order_items').insert(lines.map((line) => ({
      order_id: order.id,
      product_id: line.id,
      product_name: line.name,
      unit_price: Number(line.price),
      quantity: line.quantity,
      subtotal: Number(line.price) * line.quantity,
    })))
    if (itemsError) {
      await supabase.from('orders').delete().eq('id', order.id)
      return toast.error(itemsError.message)
    }
    if (orderType === 'local' && tableId) await supabase.from('restaurant_tables').update({ status: 'ocupada' }).eq('id', tableId)
    setLines([])
    setOpen(false)
    toast.success('Pedido enviado a cocina')
    await queryClient.invalidateQueries({ queryKey: ['orders'] })
    await queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
  }

  if (query.isPending) return <PageShell title='Pedidos' description='Seguimiento de pedidos y cobros'><PageLoading /></PageShell>
  if (query.error) return <PageShell title='Pedidos'><PageError message={errorMessage(query.error)} /></PageShell>

  const canCreate = role.data === 'admin' || role.data === 'mesero'

  return (
    <PageShell
      title='Pedidos'
      description={`${query.data.orders.length} pedidos ${filter === 'activos' ? 'activos' : 'recientes'}`}
      action={canCreate ? (
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setLines([]) }}>
          <DialogTrigger asChild><Button><Plus /> Nuevo pedido</Button></DialogTrigger>
          <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-xl'>
            <DialogHeader><DialogTitle>Crear pedido</DialogTitle></DialogHeader>
            <form id='order-form' onSubmit={addOrder} className='grid gap-4'>
              <FormField label='Tipo de pedido'><NativeSelect name='order_type' defaultValue='local'><option value='local'>En local</option><option value='llevar'>Para llevar</option><option value='delivery'>Delivery</option></NativeSelect></FormField>
              <FormField label='Mesa (para pedidos en local)'><NativeSelect name='table_id' defaultValue=''><option value=''>Seleccionar mesa</option>{query.data.tables.filter((table) => table.status !== 'ocupada').map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</NativeSelect></FormField>
              <FormField label='Cliente (opcional)'><TextInput name='customer_name' placeholder='Nombre del cliente' /></FormField>
              <FormField label='Dirección de delivery'><TextInput name='delivery_address' placeholder='Dirección y referencia' /></FormField>
              <FormField label='Costo de delivery (S/)'><TextInput name='delivery_fee' type='number' min='0' step='0.5' defaultValue='0' /></FormField>
              <div className='grid grid-cols-[1fr_92px_auto] gap-2'>
                <NativeSelect id='order-product' defaultValue=''><option value=''>Agregar producto…</option>{query.data.products.map((product) => <option key={product.id} value={product.id}>{product.name} · {formatMoney(product.price)}</option>)}</NativeSelect>
                <TextInput id='order-quantity' type='number' min='1' defaultValue='1' aria-label='Cantidad' />
                <Button type='button' variant='secondary' onClick={() => {
                  const productId = (document.getElementById('order-product') as HTMLSelectElement).value
                  const quantity = Number((document.getElementById('order-quantity') as HTMLInputElement).value)
                  const product = query.data.products.find((item) => item.id === productId)
                  if (!product || quantity < 1) return
                  setLines((current) => {
                    const existing = current.find((line) => line.id === product.id)
                    return existing ? current.map((line) => line.id === product.id ? { ...line, quantity: line.quantity + quantity } : line) : [...current, { ...product, quantity }]
                  })
                }}>Agregar</Button>
              </div>
              {lines.length > 0 && (
                <div className='divide-y rounded-lg border px-3'>
                  {lines.map((line) => <div key={line.id} className='flex items-center justify-between gap-3 py-2 text-sm'><span>{line.quantity} × {line.name}</span><span className='font-medium'>{formatMoney(Number(line.price) * line.quantity)}</span></div>)}
                  <div className='flex justify-between py-3 font-semibold'><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
                </div>
              )}
              <FormField label='Notas para cocina (opcional)'><TextInput name='notes' placeholder='Ej. sin ají' /></FormField>
            </form>
            <DialogFooter><Button type='submit' form='order-form'>Enviar a cocina</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      ) : undefined}
    >
      <div className='flex flex-wrap gap-2'>
        <Button variant={filter === 'activos' ? 'default' : 'outline'} onClick={() => setFilter('activos')}>Activos</Button>
        <Button variant={filter === 'todos' ? 'default' : 'outline'} onClick={() => setFilter('todos')}>Todos</Button>
        <Button variant='ghost' size='icon' aria-label='Actualizar pedidos' onClick={() => void query.refetch()}><RefreshCw className='size-4' /></Button>
      </div>
      {!query.data.orders.length ? <EmptyState title='No hay pedidos para mostrar' description='Los pedidos creados aparecerán aquí.' /> : (
        <div className='grid gap-3'>
          {query.data.orders.map((order) => (
            <Card key={order.id}>
              <CardContent className='flex flex-wrap items-center justify-between gap-4 p-4'>
                <div className='min-w-48 flex-1'>
                  <div className='font-semibold'>Pedido #{order.order_number}{order.restaurant_tables?.name ? ` · ${order.restaurant_tables.name}` : ''}</div>
                  <p className='mt-1 text-sm text-muted-foreground'>{order.customer_name || order.order_type} · {formatDateTime(order.created_at)}</p>
                </div>
                <div className='flex items-center gap-3'>
                  <span className='font-semibold'>{formatMoney(order.total)}</span>
                  {role.data !== 'cocina' ? (
                    <NativeSelect className='w-auto min-w-36' aria-label={`Estado del pedido ${order.order_number}`} value={order.status} onChange={(event) => updateStatus.mutate({ order, status: event.target.value as OrderStatus })}>
                      {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </NativeSelect>
                  ) : <span className='rounded-full bg-muted px-3 py-1 text-xs'>{statusLabels[order.status]}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
