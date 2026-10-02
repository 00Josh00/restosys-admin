import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, UsersRound, Edit } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { OrderDialogSplit } from './OrderDialogSplit'
import { useMenu } from './menu'
import {
  errorMessage,
  FormField,
  formatMoney,
  PageError,
  PageLoading,
  PageShell,
  TextInput,
  useUserRole,
} from './shared'

type RestaurantTable = {
  id: string
  name: string
  capacity: number
  status: 'libre' | 'ocupada' | 'reservada'
}
type ActiveOrder = {
  id: string
  order_number: number
  total: number
  table_id: string
}

const activeStatuses = ['pendiente', 'preparacion', 'listo', 'entregado']

export function TablesPage() {
  const queryClient = useQueryClient()
  const role = useUserRole()
  const menu = useMenu()
  const [open, setOpen] = useState(false)
  const [createOrderForTable, setCreateOrderForTable] =
    useState<RestaurantTable | null>(null)
  const [editTable, setEditTable] = useState<RestaurantTable | null>(null)

  const updateTable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editTable) return
    const form = new FormData(event.currentTarget)
    const { error } = await supabase
      .from('restaurant_tables')
      .update({
        name: String(form.get('name')).trim(),
        capacity: Number(form.get('capacity')),
      })
      .eq('id', editTable.id)
    if (error) return toast.error(error.message)
    toast.success('Mesa actualizada')
    setEditTable(null)
    await queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
  }

  const tablesQuery = useQuery({
    queryKey: ['restaurant-tables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('*')
        .order('name')
      if (error) throw error
      return (data ?? []) as RestaurantTable[]
    },
    refetchInterval: 30_000,
  })

  const ordersQuery = useQuery({
    queryKey: ['restaurant-tables-active-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, total, table_id')
        .in('status', activeStatuses)
        .not('table_id', 'is', null)
      if (error) throw error
      return (data ?? []) as ActiveOrder[]
    },
    refetchInterval: 30_000,
  })

  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
      void queryClient.invalidateQueries({
        queryKey: ['restaurant-tables-active-orders'],
      })
    }
    const channel = supabase
      .channel('admin-tables')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'restaurant_tables' },
        invalidate
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        invalidate
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])

  const orderByTable = useMemo(() => {
    const map = new Map<string, ActiveOrder>()
    for (const order of ordersQuery.data ?? []) {
      const current = map.get(order.table_id)
      if (!current || order.order_number > current.order_number)
        map.set(order.table_id, order)
    }
    return map
  }, [ordersQuery.data])

  const addTable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const { error } = await supabase.from('restaurant_tables').insert({
      name: String(form.get('name')).trim(),
      capacity: Number(form.get('capacity')),
    })
    if (error) return toast.error(error.message)
    toast.success('Mesa agregada')
    setOpen(false)
    await queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
  }

  const removeTable = async (table: RestaurantTable) => {
    if (orderByTable.has(table.id)) {
      toast.error(
        `${table.name} tiene un pedido activo. Ciérralo antes de eliminarla.`
      )
      return
    }
    if (!window.confirm(`¿Eliminar ${table.name}?`)) return
    const { error } = await supabase
      .from('restaurant_tables')
      .delete()
      .eq('id', table.id)
    if (error) return toast.error(error.message)
    toast.success('Mesa eliminada')
    await queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
  }

  if (tablesQuery.isPending)
    return (
      <PageShell title='Mesas' description='Estado del salón en tiempo real'>
        <PageLoading />
      </PageShell>
    )
  if (tablesQuery.error)
    return (
      <PageShell title='Mesas'>
        <PageError message={errorMessage(tablesQuery.error)} />
      </PageShell>
    )

  const tables = tablesQuery.data
  const occupied = tables.filter((table) => orderByTable.has(table.id)).length
  const available = tables.length - occupied

  return (
    <PageShell
      title='Mesas'
      description={`${available} libres · ${occupied} ocupadas · ${tables.length} en total`}
      action={
        role.data === 'admin' ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus /> Agregar mesa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva mesa</DialogTitle>
              </DialogHeader>
              <form id='table-form' onSubmit={addTable} className='grid gap-4'>
                <FormField label='Nombre'>
                  <TextInput name='name' required placeholder='Ej. Mesa 6' />
                </FormField>
                <FormField label='Capacidad'>
                  <TextInput
                    name='capacity'
                    type='number'
                    min='1'
                    max='30'
                    defaultValue='4'
                    required
                  />
                </FormField>
              </form>
              <DialogFooter>
                <Button type='submit' form='table-form'>
                  Guardar mesa
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      {!tables.length ? (
        <Card>
          <CardContent className='py-10 text-center text-muted-foreground'>
            Todavía no hay mesas registradas.
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          {tables.map((table) => {
            const order = orderByTable.get(table.id)
            const free = !order
            return (
              <Card
                key={table.id}
                className={`cursor-pointer overflow-hidden transition-all hover:shadow-md active:scale-[0.99] ${free ? 'hover:border-emerald-500/50' : 'hover:border-rose-500/50'}`}
                onClick={() => {
                  if (role.data === 'admin' || role.data === 'mesero') {
                    setCreateOrderForTable(table)
                  }
                }}
              >
                <CardHeader className='flex flex-row items-start justify-between space-y-0 pb-3'>
                  <div>
                    <CardTitle className='text-lg'>{table.name}</CardTitle>
                    <p className='mt-1 flex items-center gap-1 text-sm text-muted-foreground'>
                      <UsersRound className='size-4' /> {table.capacity}{' '}
                      personas
                    </p>
                  </div>
                  {role.data === 'admin' && (
                    <Button
                      variant='ghost'
                      size='icon'
                      aria-label={`Editar ${table.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditTable(table)
                      }}
                    >
                      <Edit className='size-4' />
                    </Button>
                  )}
                  {role.data === 'admin' && (
                    <Button
                      variant='ghost'
                      size='icon'
                      aria-label={`Eliminar ${table.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        void removeTable(table)
                      }}
                    >
                      <Trash2 className='size-4' />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className='space-y-2'>
                  <div
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${free ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'}`}
                  >
                    {free ? 'Libre' : 'Ocupada'}
                  </div>
                  {order && (
                    <p className='text-sm text-muted-foreground'>
                      Pedido #{order.order_number} · {formatMoney(order.total)}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      {createOrderForTable && (
        <OrderDialogSplit
          key={createOrderForTable.id}
          open={Boolean(createOrderForTable)}
          onOpenChange={(open: boolean) =>
            !open && setCreateOrderForTable(null)
          }
          mode='create'
          menu={menu.data ?? { products: [], categories: [], comboOptions: [] }}
          tables={tablesQuery.data ?? []}
          onDone={() => {
            void queryClient.invalidateQueries({ queryKey: ['orders'] })
            void queryClient.invalidateQueries({
              queryKey: ['restaurant-tables'],
            })
            void queryClient.invalidateQueries({
              queryKey: ['restaurant-tables-active-orders'],
            })
            void queryClient.invalidateQueries({ queryKey: ['menu'] })
          }}
          initialTableId={createOrderForTable.id}
        />
      )}
      {editTable && (
        <Dialog
          open={Boolean(editTable)}
          onOpenChange={(open: boolean) =>
            !open && setEditTable(null)
          }
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar mesa</DialogTitle>
            </DialogHeader>
            <form id='edit-table-form' onSubmit={updateTable} className='grid gap-4'>
              <FormField label='Nombre'>
                <TextInput name='name' required defaultValue={editTable.name} />
              </FormField>
              <FormField label='Capacidad'>
                <TextInput
                  name='capacity'
                  type='number'
                  min='1'
                  max='30'
                  defaultValue={editTable.capacity}
                  required
                />
              </FormField>
            </form>
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setEditTable(null)}>
                Cancelar
              </Button>
              <Button type='submit' form='edit-table-form'>
                Guardar cambios
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  )
}
