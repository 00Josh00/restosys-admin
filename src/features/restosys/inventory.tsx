import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownToLine, Plus, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
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
import {
  EmptyState,
  errorMessage,
  FormField,
  formatDateTime,
  formatMoney,
  MetricCard,
  NativeSelect,
  PageError,
  PageLoading,
  PageShell,
  TextInput,
  useUserRole,
} from './shared'

type InventoryItem = {
  id: string
  name: string
  unit: string
  current_stock: number
  minimum_stock: number
  unit_cost: number
  is_active: boolean
}
type Movement = {
  id: string
  movement_type: 'entrada' | 'salida' | 'ajuste'
  quantity: number
  created_at: string
  inventory_items: { name: string } | null
}

const movementLabels = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
} as const

export function InventoryPage() {
  const queryClient = useQueryClient()
  const role = useUserRole()
  const [itemOpen, setItemOpen] = useState(false)
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null)
  const query = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const [itemsResult, movementsResult] = await Promise.all([
        supabase.from('inventory_items').select('*').order('name'),
        supabase
          .from('inventory_movements')
          .select(
            'id, movement_type, quantity, created_at, inventory_items(name)'
          )
          .order('created_at', { ascending: false })
          .limit(12),
      ])
      const error = itemsResult.error ?? movementsResult.error
      if (error) throw error
      return {
        items: (itemsResult.data ?? []) as InventoryItem[],
        movements: (movementsResult.data ?? []) as unknown as Movement[],
      }
    },
  })

  const registerMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const { error } = await supabase.rpc('record_inventory_movement', {
      p_inventory_item_id: movementItem?.id,
      p_movement_type: String(form.get('movement_type')),
      p_quantity: Number(form.get('quantity')),
      p_unit_cost: Number(form.get('unit_cost') || 0),
      p_note: String(form.get('note') || '').trim() || null,
    })
    if (error) return toast.error(error.message)
    toast.success('Movimiento registrado')
    setMovementItem(null)
    await queryClient.invalidateQueries({ queryKey: ['inventory'] })
  }

  const addItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const currentStock = Number(form.get('current_stock') || 0)
    const unitCost = Number(form.get('unit_cost') || 0)
    const { data: item, error } = await supabase
      .from('inventory_items')
      .insert({
        name: String(form.get('name')).trim(),
        unit: String(form.get('unit')),
        minimum_stock: Number(form.get('minimum_stock') || 0),
        unit_cost: unitCost,
        current_stock: 0,
      })
      .select('id')
      .single()
    if (error || !item)
      return toast.error(error?.message ?? 'No se pudo crear el insumo.')
    if (currentStock > 0) {
      const { error: movementError } = await supabase.rpc(
        'record_inventory_movement',
        {
          p_inventory_item_id: item.id,
          p_movement_type: 'entrada',
          p_quantity: currentStock,
          p_unit_cost: unitCost,
          p_note: 'Stock inicial',
        }
      )
      if (movementError) return toast.error(movementError.message)
    }
    toast.success('Insumo agregado')
    setItemOpen(false)
    await queryClient.invalidateQueries({ queryKey: ['inventory'] })
  }

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('inventory_items')
        .update({ is_active: active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (query.isPending)
    return (
      <PageShell title='Inventario' description='Insumos, stock y movimientos'>
        <PageLoading />
      </PageShell>
    )
  if (query.error)
    return (
      <PageShell title='Inventario'>
        <PageError message={errorMessage(query.error)} />
      </PageShell>
    )

  const isAdmin = role.data === 'admin'
  const lowStock = query.data.items.filter(
    (item) =>
      item.is_active && Number(item.current_stock) <= Number(item.minimum_stock)
  )
  const stockValue = query.data.items.reduce(
    (sum, item) => sum + Number(item.current_stock) * Number(item.unit_cost),
    0
  )

  return (
    <PageShell
      title='Inventario'
      description='Controla los insumos, el stock mínimo y las entradas y salidas.'
      action={
        isAdmin ? (
          <Dialog open={itemOpen} onOpenChange={setItemOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus /> Nuevo insumo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar insumo</DialogTitle>
              </DialogHeader>
              <form id='item-form' onSubmit={addItem} className='grid gap-4'>
                <FormField label='Nombre'>
                  <TextInput
                    name='name'
                    required
                    placeholder='Ej. Pescado fresco'
                  />
                </FormField>
                <FormField label='Unidad'>
                  <NativeSelect name='unit' defaultValue='kg'>
                    <option value='unidad'>Unidad</option>
                    <option value='kg'>Kilogramo</option>
                    <option value='g'>Gramo</option>
                    <option value='litro'>Litro</option>
                    <option value='ml'>Mililitro</option>
                    <option value='paquete'>Paquete</option>
                  </NativeSelect>
                </FormField>
                <div className='grid grid-cols-2 gap-3'>
                  <FormField label='Stock inicial'>
                    <TextInput
                      name='current_stock'
                      type='number'
                      min='0'
                      step='0.001'
                      defaultValue='0'
                    />
                  </FormField>
                  <FormField label='Stock mínimo'>
                    <TextInput
                      name='minimum_stock'
                      type='number'
                      min='0'
                      step='0.001'
                      defaultValue='0'
                    />
                  </FormField>
                </div>
                <FormField label='Costo unitario (S/)'>
                  <TextInput
                    name='unit_cost'
                    type='number'
                    min='0'
                    step='0.01'
                    defaultValue='0'
                  />
                </FormField>
              </form>
              <DialogFooter>
                <Button type='submit' form='item-form'>
                  Guardar insumo
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        <MetricCard
          title='Insumos activos'
          value={query.data.items.filter((item) => item.is_active).length}
        />
        <MetricCard
          title='Stock bajo'
          value={lowStock.length}
          detail={lowStock.length ? 'Requieren reposición' : 'Todo en orden'}
        />
        <MetricCard
          title='Valor del inventario'
          value={formatMoney(stockValue)}
        />
      </div>

      {!query.data.items.length ? (
        <EmptyState
          title='Todavía no hay insumos'
          description='Agrega el primer insumo para empezar a controlar el stock.'
        />
      ) : (
        <div className='grid gap-4 lg:grid-cols-2'>
          {query.data.items.map((item) => {
            const low =
              item.is_active &&
              Number(item.current_stock) <= Number(item.minimum_stock)
            return (
              <Card key={item.id}>
                <CardContent className='flex flex-wrap items-center justify-between gap-3 p-4'>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <p className='font-medium'>{item.name}</p>
                      {!item.is_active && (
                        <Badge variant='outline'>Inactivo</Badge>
                      )}
                      {low && item.is_active && (
                        <Badge variant='destructive'>Stock bajo</Badge>
                      )}
                    </div>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      {Number(item.current_stock)} {item.unit} · mínimo{' '}
                      {Number(item.minimum_stock)} {item.unit} ·{' '}
                      {formatMoney(item.unit_cost)} c/u
                    </p>
                  </div>
                  {isAdmin && (
                    <div className='flex items-center gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setMovementItem(item)}
                      >
                        <ArrowDownToLine /> Movimiento
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() =>
                          toggleActive.mutate({
                            id: item.id,
                            active: !item.is_active,
                          })
                        }
                      >
                        {item.is_active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Movimientos recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {!query.data.movements.length ? (
            <EmptyState title='Sin movimientos' />
          ) : (
            <div className='divide-y'>
              {query.data.movements.map((movement) => (
                <div
                  key={movement.id}
                  className='flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0'
                >
                  <div>
                    <p className='font-medium'>
                      {movement.inventory_items?.name ?? 'Insumo'}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {formatDateTime(movement.created_at)}
                    </p>
                  </div>
                  <div className='flex items-center gap-3'>
                    <Badge
                      variant={
                        movement.movement_type === 'entrada'
                          ? 'secondary'
                          : 'outline'
                      }
                    >
                      {movementLabels[movement.movement_type]}
                    </Badge>
                    <span className='font-semibold'>
                      {Number(movement.quantity) > 0 ? '+' : ''}
                      {Number(movement.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(movementItem)}
        onOpenChange={(next) => {
          if (!next) setMovementItem(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Movimiento de {movementItem?.name}</DialogTitle>
          </DialogHeader>
          <form
            id='movement-form'
            onSubmit={registerMovement}
            className='grid gap-4'
          >
            <FormField label='Tipo'>
              <NativeSelect name='movement_type' defaultValue='entrada'>
                <option value='entrada'>Entrada</option>
                <option value='salida'>Salida</option>
                <option value='ajuste'>Ajuste de inventario</option>
              </NativeSelect>
            </FormField>
            <FormField label='Cantidad'>
              <TextInput
                name='quantity'
                type='number'
                min='0.001'
                step='0.001'
                required
              />
            </FormField>
            <FormField label='Costo unitario (S/, opcional)'>
              <TextInput
                name='unit_cost'
                type='number'
                min='0'
                step='0.01'
                defaultValue='0'
              />
            </FormField>
            <FormField label='Nota'>
              <TextInput
                name='note'
                placeholder='Ej. compra a proveedor'
                maxLength={200}
              />
            </FormField>
          </form>
          <DialogFooter>
            <Button type='submit' form='movement-form'>
              <SlidersHorizontal /> Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
