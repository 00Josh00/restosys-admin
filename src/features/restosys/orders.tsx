import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { useMenu, type ComboOption, type MenuData, type MenuProduct } from './menu'
import { EmptyState, errorMessage, FormField, formatDateTime, formatMoney, NativeSelect, PageError, PageShell, TextInput, useUserRole } from './shared'
import { Skeleton } from '@/components/ui/skeleton'

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
type CartLine = { key: string; product: MenuProduct; quantity: number; components: MenuProduct[] }

const statusLabels: Record<OrderStatus, string> = {
  pendiente: 'Pendiente', preparacion: 'En preparación', listo: 'Listo',
  entregado: 'Entregado', pagado: 'Pagado', cancelado: 'Cancelado',
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

      {!orders.length ? <EmptyState title='No hay pedidos para mostrar' description='Los pedidos creados aparecerán aquí.' /> : (
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
        <OrderDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode='create'
          menu={menu.data}
          tables={tablesQuery.data}
          onDone={invalidateAll}
        />
      )}

      {appendOrder && (
        <OrderDialog
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

function buildComboChoices(comboOptions: ComboOption[], products: MenuProduct[]) {
  const byId = new Map(products.map((product) => [product.id, product]))
  const map = new Map<string, MenuProduct[]>()
  for (const option of comboOptions) {
    const product = byId.get(option.option_id)
    if (!product) continue
    const list = map.get(option.combo_id) ?? []
    list.push(product)
    map.set(option.combo_id, list)
  }
  return map
}

export function OrderDialog({
  open,
  onOpenChange,
  mode,
  order,
  menu,
  tables,
  onDone,
  initialTableId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'append'
  order?: Order
  menu: MenuData
  tables: Table[]
  onDone: () => void
  initialTableId?: string
}) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [combo, setCombo] = useState<{ product: MenuProduct; editingKey: string | null; selection: string[] } | null>(null)
  const [saving, setSaving] = useState(false)

  const availableProducts = useMemo(() => menu.products.filter((product) => product.is_available), [menu.products])
  const comboChoices = useMemo(() => buildComboChoices(menu.comboOptions, availableProducts), [menu.comboOptions, availableProducts])

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0), [lines])

  const defaultSelection = (product: MenuProduct) => {
    const slots = product.combo_slots ?? 2
    const choices = comboChoices.get(product.id) ?? []
    const allowed = new Set(choices.map((choice) => choice.id))
    const defaults = menu.comboOptions
      .filter((option) => option.combo_id === product.id && option.is_default && allowed.has(option.option_id))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((option) => option.option_id)
    const selection: string[] = []
    for (const id of defaults) {
      if (selection.length >= slots) break
      if (!selection.includes(id)) selection.push(id)
    }
    for (const choice of choices) {
      if (selection.length >= slots) break
      if (!selection.includes(choice.id)) selection.push(choice.id)
    }
    return selection
  }

  const lineKey = (product: MenuProduct, components: MenuProduct[]) =>
    product.is_combo && components.length ? `${product.id}::${components.map((component) => component.id).sort().join('|')}` : product.id

  const upsertLine = (product: MenuProduct, quantity: number, components: MenuProduct[]) => {
    const key = lineKey(product, components)
    setLines((current) => {
      const existing = current.find((line) => line.key === key)
      if (existing) return current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + quantity } : line))
      return [...current, { key, product, quantity, components }]
    })
  }

  const addProductFromPicker = () => {
    const select = document.getElementById('order-product') as HTMLSelectElement | null
    const quantityInput = document.getElementById('order-quantity') as HTMLInputElement | null
    const product = availableProducts.find((item) => item.id === select?.value)
    const quantity = Number(quantityInput?.value ?? 1)
    if (!product || quantity < 1) return
    if (product.is_combo) {
      setCombo({ product, editingKey: null, selection: defaultSelection(product) })
      return
    }
    upsertLine(product, quantity, [])
  }

  const confirmCombo = () => {
    if (!combo) return
    const slots = combo.product.combo_slots ?? 2
    if (combo.selection.length !== slots || new Set(combo.selection).size !== slots) {
      toast.error(`Elige ${slots} platos distintos para el combo.`)
      return
    }
    const components = combo.selection.map((id) => availableProducts.find((product) => product.id === id)).filter((product): product is MenuProduct => Boolean(product))
    if (components.length !== slots) {
      toast.error('Alguna opción ya no está disponible.')
      return
    }
    if (combo.editingKey) {
      setLines((current) => current.map((line) => (line.key === combo.editingKey ? { ...line, key: lineKey(combo.product, components), components } : line)))
    } else {
      upsertLine(combo.product, 1, components)
    }
    setCombo(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!lines.length) return toast.error('Agrega al menos un producto al pedido.')
    const items = lines.map((line) => ({
      product_id: line.product.id,
      quantity: line.quantity,
      notes: null,
      components: line.components.length ? line.components.map((component) => ({ product_id: component.id })) : null,
    }))

    setSaving(true)
    try {
      if (mode === 'append' && order) {
        const { error } = await supabase.rpc('add_order_items', { p_order_id: order.id, p_items: items })
        if (error) throw new Error(error.message)
        toast.success('Platos agregados al pedido')
        onDone()
        onOpenChange(false)
        return
      }

      const form = new FormData(event.currentTarget)
      const orderType = String(form.get('order_type')) as OrderType
      const tableId = String(form.get('table_id') || '')
      if (orderType === 'local' && !tableId) {
        toast.error('Selecciona una mesa.')
        return
      }
      const deliveryFee = (orderType === 'delivery' && !initialTableId) ? Number(form.get('delivery_fee') || 0) : 0

      const { error } = await supabase.rpc('create_order_with_items', {
        p_order: {
          order_type: orderType,
          table_id: orderType === 'local' ? tableId : null,
          customer_name: String(form.get('customer_name') || '').trim(),
          customer_phone: null,
          delivery_address: orderType === 'delivery' ? String(form.get('delivery_address') || '').trim() : null,
          delivery_fee: deliveryFee,
          notes: String(form.get('notes') || '').trim(),
        },
        p_items: items,
      })
      if (error) throw new Error(error.message)
      toast.success('Pedido enviado a cocina')
      onDone()
      onOpenChange(false)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const isAppend = mode === 'append'
  const canSubmit = lines.length > 0 && !saving

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-xl' style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <DialogHeader>
            <DialogTitle>{isAppend ? `Agregar platos · Pedido #${order?.order_number ?? ''}` : 'Crear pedido'}</DialogTitle>
          </DialogHeader>
          <form id='order-form' onSubmit={submit} className='grid gap-4'>
            {isAppend ? (
              <p className='rounded-lg bg-muted p-3 text-sm text-muted-foreground'>Se sumarán al pedido existente y se recalculará el total.</p>
            ) : (
              <>
                <FormField label='Tipo de pedido'>
                  <NativeSelect name='order_type' defaultValue={initialTableId ? 'local' : 'local'} disabled={!!initialTableId}>
                    <option value='local'>En local</option>
                    <option value='llevar'>Para llevar</option>
                    <option value='delivery'>Delivery</option>
                  </NativeSelect>
                  {initialTableId && <input type='hidden' name='order_type' value='local' />}
                </FormField>
                <FormField label='Mesa (para pedidos en local)'>
                  <NativeSelect name='table_id' defaultValue={initialTableId || ''} disabled={!!initialTableId}>
                    <option value=''>Seleccionar mesa</option>
                    {tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                  </NativeSelect>
                  {initialTableId && <input type='hidden' name='table_id' value={initialTableId} />}
                </FormField>
                <FormField label='Cliente (opcional)'><TextInput name='customer_name' placeholder='Nombre del cliente' /></FormField>
                {!initialTableId && (
                  <>
                    <FormField label='Dirección de delivery'><TextInput name='delivery_address' placeholder='Dirección y referencia' /></FormField>
                    <FormField label='Costo de delivery (S/)'><TextInput name='delivery_fee' type='number' min='0' step='0.5' defaultValue='0' /></FormField>
                  </>
                )}
              </>
            )}

            <div className='grid grid-cols-[1fr_92px_auto] gap-2'>
              <NativeSelect id='order-product' defaultValue=''>
                <option value=''>Agregar producto…</option>
                {availableProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {formatMoney(product.price)}</option>)}
              </NativeSelect>
              <TextInput id='order-quantity' type='number' min='1' defaultValue='1' aria-label='Cantidad' />
              <Button type='button' variant='secondary' onClick={addProductFromPicker}>Agregar</Button>
            </div>

            {lines.length > 0 && (
              <div className='divide-y rounded-lg border px-3'>
                {lines.map((line) => (
                  <div key={line.key} className='grid gap-2 py-3 text-sm'>
                    <div className='flex items-center justify-between gap-3'>
                      <span className='min-w-0'>
                        <strong>{line.quantity}×</strong> {line.product.name}
                        {line.components.length > 0 && (
                          <span className='block text-xs text-muted-foreground'>{line.components.map((component) => component.name).join(' + ')}</span>
                        )}
                      </span>
                      <span className='flex items-center gap-1'>
                        <span className='font-medium'>{formatMoney(Number(line.product.price) * line.quantity)}</span>
                        <Button type='button' size='icon' variant='ghost' aria-label='Quitar uno' onClick={() => setLines((current) => current.map((item) => item.key === line.key ? { ...item, quantity: item.quantity - 1 } : item).filter((item) => item.quantity > 0))}><Minus className='size-4' /></Button>
                        <Button type='button' size='icon' variant='ghost' aria-label='Agregar uno' onClick={() => setLines((current) => current.map((item) => item.key === line.key ? { ...item, quantity: item.quantity + 1 } : item))}><Plus className='size-4' /></Button>
                        <Button type='button' size='icon' variant='ghost' aria-label='Eliminar línea' onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><Trash2 className='size-4' /></Button>
                      </span>
                    </div>
                    {line.product.is_combo && (
                      <Button type='button' size='sm' variant='outline' className='w-fit' onClick={() => setCombo({ product: line.product, editingKey: line.key, selection: line.components.map((component) => component.id) })}>
                        Cambiar platos del combo
                      </Button>
                    )}
                  </div>
                ))}
                <div className='flex justify-between py-3 font-semibold'><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
              </div>
            )}

            {!isAppend && <FormField label='Notas para cocina (opcional)'><TextInput name='notes' placeholder='Ej. sin ají' /></FormField>}
          </form>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type='submit' form='order-form' disabled={!canSubmit}>{saving ? 'Guardando…' : isAppend ? 'Agregar platos' : 'Enviar a cocina'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {combo && (
        <Dialog open onOpenChange={(next) => !next && setCombo(null)}>
          <DialogContent className='sm:max-w-md' style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <DialogHeader>
              <DialogTitle>{combo.product.combo_slots === 3 ? 'Arma tu trío' : 'Arma tu dúo'} · {combo.product.name}</DialogTitle>
            </DialogHeader>
            <p className='text-sm text-muted-foreground'>{formatMoney(combo.product.price)} · elige {combo.product.combo_slots ?? 2} platos</p>
            <div className='grid gap-3'>
              {Array.from({ length: combo.product.combo_slots ?? 2 }).map((_, index) => (
                <FormField key={index} label={`Plato ${index + 1}`}>
                  <NativeSelect
                    value={combo.selection[index] ?? ''}
                    onChange={(event) => setCombo((current) => {
                      if (!current) return current
                      const selection = [...current.selection]
                      selection[index] = event.target.value
                      return { ...current, selection }
                    })}
                  >
                    <option value=''>Elegir…</option>
                    {(comboChoices.get(combo.product.id) ?? []).map((choice) => (
                      <option key={choice.id} value={choice.id} disabled={combo.selection.includes(choice.id) && combo.selection[index] !== choice.id}>{choice.name}</option>
                    ))}
                  </NativeSelect>
                </FormField>
              ))}
            </div>
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setCombo(null)}>Cancelar</Button>
              <Button type='button' onClick={confirmCombo}>{combo.editingKey ? 'Guardar combo' : 'Agregar combo'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
