'use client'

import { useState, useMemo, type FormEvent } from 'react'
import {
  Minus,
  Plus,
  X,
  Search,
  UtensilsCrossed,
  Wine,
  Coffee,
  ChefHat,
  Package,
  Trash2,
  ShoppingCart,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { FormField, TextInput, NativeSelect, formatMoney, errorMessage } from './shared'
import { supabase } from '@/lib/supabase'
import { type MenuProduct, type MenuData, type ComboOption } from './menu'

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

interface OrderDialogSplitProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'append'
  order?: Order
  menu: MenuData
  tables: Table[]
  onDone: () => void
  initialTableId?: string
}

export function OrderDialogSplit({
  open,
  onOpenChange,
  mode,
  order,
  menu,
  tables,
  onDone,
  initialTableId,
}: OrderDialogSplitProps) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [combo, setCombo] = useState<{
    product: MenuProduct
    editingKey: string | null
    selection: string[]
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('Todos')
  const [cartOpen, setCartOpen] = useState(false)

  const isAppend = mode === 'append'

  const availableProducts = useMemo<MenuProduct[]>(
    () => menu.products.filter((p: MenuProduct) => p.is_available),
    [menu.products]
  )

  const comboChoices = useMemo<Map<string, MenuProduct[]>>(() => {
    const byId = new Map(availableProducts.map((p: MenuProduct) => [p.id, p]))
    const map = new Map<string, MenuProduct[]>()
    for (const opt of menu.comboOptions) {
      const product = byId.get(opt.option_id)
      if (!product) continue
      const list = map.get(opt.combo_id) ?? []
      list.push(product)
      map.set(opt.combo_id, list)
    }
    return map
  }, [menu.comboOptions, availableProducts])

  const categories = useMemo<string[]>(() => {
    const regularCats = Array.from(
      new Set(
        availableProducts
          .filter((p: MenuProduct) => !p.is_combo)
          .map((p: MenuProduct) => p.categories?.name)
          .filter((c): c is string => Boolean(c))
      )
    ).sort()
    const hasDuos = availableProducts.some((p: MenuProduct) => p.is_combo && p.combo_slots === 2)
    const hasTrios = availableProducts.some((p: MenuProduct) => p.is_combo && p.combo_slots === 3)
    const cats: string[] = ['Todos']
    if (hasDuos) cats.push('Dúos')
    if (hasTrios) cats.push('Tríos')
    return [...cats, ...regularCats]
  }, [availableProducts])

  const filteredProducts = useMemo<MenuProduct[]>(() => {
    let result = availableProducts
    if (activeCategory === 'Dúos') {
      result = result.filter((p: MenuProduct) => p.is_combo && p.combo_slots === 2)
    } else if (activeCategory === 'Tríos') {
      result = result.filter((p: MenuProduct) => p.is_combo && p.combo_slots === 3)
    } else if (activeCategory !== 'Todos') {
      result = result.filter((p: MenuProduct) => p.categories?.name === activeCategory)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((p: MenuProduct) => p.name.toLowerCase().includes(q))
    }
    return result
  }, [availableProducts, activeCategory, searchQuery])

  const subtotal = useMemo<number>(
    () => lines.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0),
    [lines]
  )

  const totalItems = useMemo<number>(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines]
  )

  const quantityByProduct = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>()
    for (const line of lines) {
      map.set(line.product.id, (map.get(line.product.id) ?? 0) + line.quantity)
    }
    return map
  }, [lines])

  const tableName = initialTableId
    ? tables.find((t) => t.id === initialTableId)?.name
    : undefined

  const defaultSelection = (product: MenuProduct) => {
    const slots = product.combo_slots ?? 2
    const choices = comboChoices.get(product.id) ?? []
    const allowed = new Set(choices.map((c) => c.id))
    const defaults = menu.comboOptions
      .filter((o: ComboOption) => o.combo_id === product.id && o.is_default && allowed.has(o.option_id))
      .sort((a: ComboOption, b: ComboOption) => a.sort_order - b.sort_order)
      .map((o: ComboOption) => o.option_id)
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
    product.is_combo && components.length
      ? `${product.id}::${components.map((c) => c.id).sort().join('|')}`
      : product.id

  const upsertLine = (product: MenuProduct, quantity: number, components: MenuProduct[]) => {
    const key = lineKey(product, components)
    setLines((current) => {
      const existing = current.find((line) => line.key === key)
      if (existing)
        return current.map((line) =>
          line.key === key ? { ...line, quantity: line.quantity + quantity } : line
        )
      return [...current, { key, product, quantity, components }]
    })
  }

  const changeQty = (key: string, delta: number) => {
    setLines((current) =>
      current
        .map((line) => (line.key === key ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0)
    )
  }

  const addToCart = (product: MenuProduct) => {
    if (product.is_combo) {
      setCombo({ product, editingKey: null, selection: defaultSelection(product) })
      return
    }
    upsertLine(product, 1, [])
  }

  const confirmCombo = () => {
    if (!combo) return
    const slots = combo.product.combo_slots ?? 2
    const chosen = combo.selection.filter(Boolean)
    if (chosen.length !== slots || new Set(chosen).size !== slots) {
      toast.error(`Elige ${slots} platos distintos para el combo.`)
      return
    }
    const components = chosen
      .map((id) => availableProducts.find((p: MenuProduct) => p.id === id))
      .filter((p): p is MenuProduct => Boolean(p))
    if (components.length !== slots) {
      toast.error('Alguna opción ya no está disponible.')
      return
    }
    if (combo.editingKey) {
      setLines((current) =>
        current.map((line) =>
          line.key === combo.editingKey
            ? { ...line, key: lineKey(combo.product, components), components }
            : line
        )
      )
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
      components: line.components.length
        ? line.components.map((c) => ({ product_id: c.id }))
        : null,
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
      if (orderType === 'local' && !tableId) return toast.error('Selecciona una mesa.')
      const deliveryFee = orderType === 'delivery' && !initialTableId ? Number(form.get('delivery_fee') || 0) : 0

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

  const canSubmit = lines.length > 0 && !saving

  const getCategoryIcon = (cat: string) => {
    const c = cat.toLowerCase()
    if (c === 'dúos' || c === 'duos' || c === 'tríos' || c === 'trios') return Package
    if (c.includes('bebida') || c.includes('drink') || c.includes('jugo') || c.includes('gaseosa') || c.includes('cerveza') || c.includes('alcohol')) return Wine
    if (c.includes('cafe') || c.includes('café') || c.includes('infusion')) return Coffee
    if (c.includes('postre') || c.includes('dulce') || c.includes('helado')) return ChefHat
    if (c.includes('entrada') || c.includes('aperitivo')) return Package
    return UtensilsCrossed
  }

  const title = isAppend ? 'Agregar platos' : 'Nuevo pedido'
  const subtitle = isAppend
    ? `Pedido #${order?.order_number ?? ''}`
    : tableName
      ? `Mesa: ${tableName}`
      : 'Selecciona productos'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className='flex flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:h-[85dvh] sm:max-w-lg'
        >
          <form id='order-form' onSubmit={submit} className='flex flex-1 flex-col min-h-0'>
            {initialTableId && (
              <>
                <input type='hidden' name='order_type' value='local' />
                <input type='hidden' name='table_id' value={initialTableId} />
              </>
            )}

            <div
              className='flex items-center justify-between gap-2 border-b px-4 py-3'
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
            >
              <div className='min-w-0'>
                <h2 className='truncate text-base font-semibold'>{title}</h2>
                <p className='truncate text-xs text-muted-foreground'>{subtitle}</p>
              </div>
              <Button type='button' variant='ghost' size='icon' onClick={() => onOpenChange(false)} aria-label='Cerrar'>
                <X className='size-5' />
              </Button>
            </div>

            {!isAppend && !initialTableId && (
              <div className='grid grid-cols-2 gap-2 border-b px-4 py-3'>
                <NativeSelect name='order_type' defaultValue='local' aria-label='Tipo de pedido'>
                  <option value='local'>🍽️ En local</option>
                  <option value='llevar'>📦 Para llevar</option>
                  <option value='delivery'>🚚 Delivery</option>
                </NativeSelect>
                <NativeSelect name='table_id' defaultValue='' aria-label='Mesa'>
                  <option value=''>Mesa…</option>
                  {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </NativeSelect>
              </div>
            )}

            {combo ? (
              <div className='flex-1 overflow-y-auto px-4 py-3'>
                <div className='mb-4'>
                  <h3 className='text-base font-semibold'>
                    {combo.product.combo_slots === 3 ? 'Arma tu trío' : 'Arma tu dúo'} · {combo.product.name}
                  </h3>
                  <p className='text-sm text-muted-foreground'>
                    {formatMoney(combo.product.price)} · elige {combo.product.combo_slots ?? 2} platos
                  </p>
                </div>
                <div className='grid gap-4'>
                  {Array.from({ length: combo.product.combo_slots ?? 2 }).map((_, index) => {
                    const chosen = combo.selection[index]
                    const options = comboChoices.get(combo.product.id) ?? []
                    return (
                      <div key={index} className='rounded-lg border p-3'>
                        <p className='mb-2 text-sm font-medium'>Plato {index + 1}</p>
                        {!chosen ? (
                          <div className='grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3'>
                            {options.map((choice) => {
                              const usedElsewhere = combo.selection.some((s, i) => s === choice.id && i !== index)
                              return (
                                <button
                                  key={choice.id}
                                  type='button'
                                  disabled={usedElsewhere}
                                  onClick={() =>
                                    setCombo((cur) => {
                                      if (!cur) return cur
                                      const s = [...cur.selection]
                                      s[index] = choice.id
                                      return { ...cur, selection: s }
                                    })
                                  }
                                  className='rounded-md border border-border bg-card p-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent/50 disabled:opacity-40 min-h-[44px]'
                                >
                                  {choice.name}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <div className='flex items-center justify-between gap-2'>
                            <span className='truncate text-sm'>
                              {options.find((o) => o.id === chosen)?.name ?? 'Plato'}
                            </span>
                            <Button
                              type='button'
                              size='sm'
                              variant='outline'
                              onClick={() =>
                                setCombo((cur) => {
                                  if (!cur) return cur
                                  const s = [...cur.selection]
                                  s[index] = ''
                                  return { ...cur, selection: s }
                                })
                              }
                            >
                              Cambiar
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className='space-y-2 border-b px-4 py-3'>
                  <div className='relative'>
                    <Search className='absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                    <input
                      type='search'
                      placeholder='Buscar producto…'
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className='h-11 w-full rounded-md border border-input bg-background pl-10 pr-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    />
                  </div>
                  <div className='flex gap-1.5 overflow-x-auto pb-0.5' role='tablist'>
                    <CategoryTab active={activeCategory === 'Todos'} onClick={() => setActiveCategory('Todos')}>
                      <Search className='size-3.5' /> Todos
                    </CategoryTab>
                    {categories.slice(1).map((cat) => {
                      const Icon = getCategoryIcon(cat)
                      return (
                        <CategoryTab key={cat} active={activeCategory === cat} onClick={() => setActiveCategory(cat)}>
                          <Icon className='size-3.5' /> {cat}
                        </CategoryTab>
                      )
                    })}
                  </div>
                </div>

                <div className='flex-1 overflow-y-auto px-4 py-3'>
                  {filteredProducts.length === 0 ? (
                    <div className='flex h-full flex-col items-center justify-center py-10 text-muted-foreground'>
                      <Search className='mb-2 size-10 opacity-50' />
                      <p className='text-sm'>No hay productos en esta categoría</p>
                    </div>
                  ) : (
                    <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                      {filteredProducts.map((product: MenuProduct) => {
                        const qty = quantityByProduct.get(product.id) ?? 0
                        return (
                          <button
                            key={product.id}
                            type='button'
                            onClick={() => addToCart(product)}
                            className='relative flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-primary/50 hover:bg-accent/50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none min-h-[56px]'
                          >
                            <div className='min-w-0 flex-1'>
                              <div className='flex items-center gap-2'>
                                <h4 className='truncate text-sm font-medium'>{product.name}</h4>
                                {product.is_combo && (
                                  <span className='inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary'>
                                    <Package className='size-2.5' /> {product.combo_slots === 3 ? 'Trío' : 'Dúo'}
                                  </span>
                                )}
                              </div>
                              <span className='text-sm font-semibold text-primary'>{formatMoney(product.price)}</span>
                            </div>
                            <div className='relative flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'>
                              <Plus className='size-4' />
                              {qty > 0 && (
                                <span className='absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground'>
                                  {qty}
                                </span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            <div
              className='border-t px-4 py-3'
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
            >
              {combo ? (
                <div className='flex gap-2'>
                  <Button type='button' variant='outline' className='h-12' onClick={() => setCombo(null)}>
                    Cancelar
                  </Button>
                  <Button
                    type='button'
                    className='h-12 flex-1 text-base'
                    onClick={confirmCombo}
                    disabled={combo.selection.filter(Boolean).length !== (combo.product.combo_slots ?? 2)}
                  >
                    {combo.editingKey ? 'Guardar combo' : 'Agregar combo'}
                  </Button>
                </div>
              ) : (
                <Button
                  type='button'
                  className='h-12 w-full text-base'
                  disabled={totalItems === 0}
                  onClick={() => setCartOpen(true)}
                >
                  <ShoppingCart className='size-5' />
                  {totalItems > 0 ? `Ver pedido (${totalItems}) · ${formatMoney(subtotal)}` : 'Selecciona productos'}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side='bottom' className='flex h-[88dvh] flex-col gap-0 p-0'>
          <SheetHeader className='border-b px-4 py-3'>
            <SheetTitle className='flex items-center gap-2'>
              <ShoppingCart className='size-5' /> Tu pedido ({totalItems})
            </SheetTitle>
          </SheetHeader>

          <div className='flex-1 overflow-y-auto px-4 py-3'>
            {lines.length === 0 ? (
              <div className='flex h-full flex-col items-center justify-center text-muted-foreground'>
                <Package className='mb-2 size-12 opacity-40' />
                <p className='text-sm'>El pedido está vacío</p>
              </div>
            ) : (
              <div className='divide-y'>
                {lines.map((line) => (
                  <div key={line.key} className='py-3'>
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-center gap-2'>
                          <span className='truncate text-sm font-medium'>{line.product.name}</span>
                          {line.product.is_combo && (
                            <span className='inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary'>
                              <Package className='size-2.5' /> {line.product.combo_slots === 3 ? 'Trío' : 'Dúo'}
                            </span>
                          )}
                        </div>
                        {line.components.length > 0 && (
                          <p className='mt-0.5 text-xs text-muted-foreground'>
                            {line.components.map((c) => c.name).join(' + ')}
                          </p>
                        )}
                        <p className='mt-0.5 text-xs text-muted-foreground'>{formatMoney(line.product.price)} c/u</p>
                      </div>
                      <span className='whitespace-nowrap text-sm font-semibold'>
                        {formatMoney(Number(line.product.price) * line.quantity)}
                      </span>
                    </div>
                    <div className='mt-2 flex items-center gap-2'>
                      <Button type='button' size='icon' variant='outline' className='size-9' onClick={() => changeQty(line.key, -1)} aria-label='Disminuir'>
                        <Minus className='size-4' />
                      </Button>
                      <span className='w-9 text-center text-base font-semibold'>{line.quantity}</span>
                      <Button type='button' size='icon' variant='outline' className='size-9' onClick={() => changeQty(line.key, 1)} aria-label='Aumentar'>
                        <Plus className='size-4' />
                      </Button>
                      <Button type='button' size='icon' variant='ghost' className='size-9 text-destructive hover:bg-destructive/10' onClick={() => changeQty(line.key, -line.quantity)} aria-label='Eliminar'>
                        <Trash2 className='size-4' />
                      </Button>
                      {line.product.is_combo && (
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='ms-auto'
                          onClick={() => setCombo({ product: line.product, editingKey: line.key, selection: line.components.map((c) => c.id) })}
                        >
                          Cambiar platos
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isAppend && (
              <div className='mt-4 space-y-3 border-t pt-4'>
                <FormField label='Cliente (opcional)'>
                  <TextInput form='order-form' name='customer_name' placeholder='Nombre del cliente' />
                </FormField>
                {!initialTableId && (
                  <div className='grid grid-cols-2 gap-2'>
                    <FormField label='Dirección delivery'>
                      <TextInput form='order-form' name='delivery_address' placeholder='Dirección' />
                    </FormField>
                    <FormField label='Costo delivery (S/)'>
                      <TextInput form='order-form' name='delivery_fee' type='number' min='0' step='0.5' defaultValue='0' />
                    </FormField>
                  </div>
                )}
                <FormField label='Notas para cocina (opcional)'>
                  <TextInput form='order-form' name='notes' placeholder='Ej. sin ají' />
                </FormField>
              </div>
            )}
          </div>

          <SheetFooter
            className='border-t px-4 py-3'
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
          >
            <div className='mb-2 flex items-center justify-between text-base font-bold'>
              <span>Total</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <Button
              type='submit'
              form='order-form'
              disabled={!canSubmit}
              className='h-12 w-full text-base'
            >
              {saving ? 'Guardando…' : isAppend ? 'Agregar platos' : 'Enviar a cocina'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

    </>
  )
}

function CategoryTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type='button'
      role='tab'
      aria-selected={active}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
      }`}
    >
      {children}
    </button>
  )
}
