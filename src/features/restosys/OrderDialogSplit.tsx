'use client'

import { useState, useMemo, type FormEvent } from 'react'
import { Minus, Plus, X, Search, UtensilsCrossed, Wine, Coffee, ChefHat, Package, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField, TextInput, NativeSelect } from './shared'
import { supabase } from '@/lib/supabase'
import { formatMoney, errorMessage } from './shared'
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

  const availableProducts = useMemo<MenuProduct[]>(
    () => menu.products.filter((p: MenuProduct) => p.is_available),
    [menu.products]
  )

  const comboChoices = useMemo<Map<string, MenuProduct[]>>(
    () => {
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
    },
    [menu.comboOptions, availableProducts]
  )

  const categories = useMemo<string[]>(
    () => ['Todos', ...Array.from(new Set(availableProducts.map((p: MenuProduct) => p.categories?.name).filter((c): c is string => Boolean(c))))],
    [availableProducts]
  )

  const filteredProducts = useMemo<MenuProduct[]>(() => {
    let result = availableProducts
    if (activeCategory !== 'Todos') {
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
    if (combo.selection.length !== slots || new Set(combo.selection).size !== slots) {
      toast.error(`Elige ${slots} platos distintos para el combo.`)
      return
    }
    const components = combo.selection
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

  const isAppend = mode === 'append'
  const canSubmit = lines.length > 0 && !saving

  const getCategoryIcon = (cat: string) => {
    const c = cat.toLowerCase()
    if (c.includes('plato') || c.includes('comida') || c.includes('principal')) return UtensilsCrossed
    if (c.includes('bebida') || c.includes('drink') || c.includes('jugo') || c.includes('gaseosa') || c.includes('cerveza') || c.includes('alcohol')) return Wine
    if (c.includes('cafe') || c.includes('café') || c.includes('infusion')) return Coffee
    if (c.includes('postre') || c.includes('dulce') || c.includes('helado')) return ChefHat
    if (c.includes('entrada') || c.includes('aperitivo')) return Package
    return UtensilsCrossed
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] w-full max-w-5xl sm:max-w-6xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <DialogHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <DialogTitle className="text-lg">
              {isAppend ? `Agregar platos · Pedido #${order?.order_number ?? ''}` : 'Crear pedido'}
            </DialogTitle>
            {!isAppend && !initialTableId && (
              <div className="flex flex-wrap gap-2">
                <FormField label="Tipo">
                  <NativeSelect name="order_type" defaultValue="local" className="w-auto">
                    <option value="local">🍽️ En local</option>
                    <option value="llevar">📦 Para llevar</option>
                    <option value="delivery">🚚 Delivery</option>
                  </NativeSelect>
                </FormField>
                <FormField label="Mesa">
                  <NativeSelect name="table_id" defaultValue="" className="w-auto min-w-[150px]">
                    <option value="">Seleccionar mesa</option>
                    {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </NativeSelect>
                </FormField>
              </div>
            )}
            {initialTableId && (
              <>
                <input type="hidden" name="order_type" value="local" />
                <input type="hidden" name="table_id" value={initialTableId} />
              </>
            )}
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute inset-s-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    type="search"
                    placeholder="Buscar producto…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 w-full pl-10 pr-4 rounded-md border border-input bg-background text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
                  <button role="tab" aria-selected={activeCategory === 'Todos'} onClick={() => setActiveCategory('Todos')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${activeCategory === 'Todos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
                    <Search className="size-3.5" /> Todos
                  </button>
                  {categories.slice(1).map((cat) => {
                    const Icon = getCategoryIcon(cat)
                    return (
                      <button key={cat} role="tab" aria-selected={activeCategory === cat} onClick={() => setActiveCategory(cat)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${activeCategory === cat ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
                        <Icon className="size-3.5" /> {cat}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto" style={{ maxHeight: '50vh' }}>
                {filteredProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <Search className="size-12 mb-2 opacity-50" />
                    <p>No hay productos en esta categoría</p>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredProducts.map((product: MenuProduct) => (
                      <button key={product.id} type="button" onClick={() => addToCart(product)} className="group relative flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-accent/50 transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none min-h-[56px]">
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm truncate">{product.name}</h4>
                            {product.is_combo && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-primary/10 text-primary">
                                <Package className="size-2.5" /> Combo
                              </span>
                            )}
                          </div>
                          <span className="font-semibold text-primary text-sm">{formatMoney(product.price)}</span>
                        </div>
                        <div className="flex items-center justify-center size-10 rounded-full bg-primary/10 text-primary shrink-0">
                          <Plus className="size-4" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-1 flex flex-col gap-3 border-l border-border pl-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Pedido</h3>
                {lines.length > 0 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setLines([])} aria-label="Limpiar pedido">
                    <X className="size-4" />
                  </Button>
                )}
              </div>

              {lines.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-lg p-6">
                  <Package className="size-12 mb-2 opacity-30" />
                  <p className="text-center">El pedido está vacío</p>
                  <p className="text-xs text-center">Selecciona productos a la izquierda</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="divide-y">
                    {lines.map((line) => (
                      <div key={line.key} className="py-3 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <strong className="text-sm">{line.quantity}×</strong>
                              <span className="font-medium text-sm truncate">{line.product.name}</span>
                              {line.product.is_combo && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary">
                                  <Package className="size-2.5" /> Combo
                                </span>
                              )}
                            </div>
                            {line.components.length > 0 && (
                              <p className="mt-1 text-xs text-muted-foreground ml-6">{line.components.map((c) => c.name).join(' + ')}</p>
                            )}
                          </div>
                          <span className="font-semibold text-sm whitespace-nowrap">{formatMoney(Number(line.product.price) * line.quantity)}</span>
                        </div>
                        <div className="flex items-center gap-1 ml-6">
                          <Button type="button" size="icon" variant="outline" className="size-7" onClick={() => setLines((c) => c.map((i) => i.key === line.key ? { ...i, quantity: i.quantity - 1 } : i).filter((i) => i.quantity > 0))} aria-label="Disminuir"><Minus className="size-3.5" /></Button>
                          <span className="w-8 text-center text-sm font-medium">{line.quantity}</span>
                          <Button type="button" size="icon" variant="outline" className="size-7" onClick={() => setLines((c) => c.map((i) => i.key === line.key ? { ...i, quantity: i.quantity + 1 } : i))} aria-label="Aumentar"><Plus className="size-3.5" /></Button>
                          <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive hover:bg-destructive/10" onClick={() => setLines((c) => c.filter((i) => i.key !== line.key))} aria-label="Eliminar"><Trash2 className="size-3.5" /></Button>
                          {line.product.is_combo && (
                            <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setCombo({ product: line.product, editingKey: line.key, selection: line.components.map((c) => c.id) })} aria-label="Modificar combo"><X className="size-3.5" /></Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t pt-4 space-y-2">
                    <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-semibold">{formatMoney(subtotal)}</span></div>
                    <div className="flex justify-between text-base font-bold border-t pt-2"><span>Total</span><span>{formatMoney(subtotal)}</span></div>
                  </div>
                </div>
              )}

              {!isAppend && (
                <div className="border-t pt-4">
                  <FormField label="Cliente (opcional)"><TextInput name="customer_name" placeholder="Nombre del cliente" /></FormField>
                  {!initialTableId && (
                    <>
                      <FormField label="Dirección de delivery"><TextInput name="delivery_address" placeholder="Dirección y referencia" /></FormField>
                      <FormField label="Costo de delivery (S/)"><TextInput name="delivery_fee" type="number" min="0" step="0.5" defaultValue="0" /></FormField>
                    </>
                  )}
                  <FormField label="Notas para cocina (opcional)"><TextInput name="notes" placeholder="Ej. sin ají, punto de cocción" /></FormField>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 w-full">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" form="order-form" disabled={!canSubmit} className="w-full sm:w-auto">
              {saving ? 'Guardando…' : isAppend ? 'Agregar platos' : 'Enviar a cocina'}
            </Button>
          </DialogFooter>

          <form id="order-form" onSubmit={submit} className="hidden">
            {initialTableId && (<> <input type="hidden" name="order_type" value="local" /> <input type="hidden" name="table_id" value={initialTableId} /> </>)}
          </form>
        </DialogContent>
      </Dialog>

      {combo && (
        <Dialog open onOpenChange={(next) => !next && setCombo(null)}>
          <DialogContent className="sm:max-w-md" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <DialogHeader>
              <DialogTitle>{combo.product.combo_slots === 3 ? 'Arma tu trío' : 'Arma tu dúo'} · {combo.product.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{formatMoney(combo.product.price)} · elige {combo.product.combo_slots ?? 2} platos</p>
            <div className="grid gap-3">
              {Array.from({ length: combo.product.combo_slots ?? 2 }).map((_, index) => (
                <FormField key={index} label={`Plato ${index + 1}`}>
                  <NativeSelect value={combo.selection[index] ?? ''} onChange={(e) => setCombo((cur) => { if (!cur) return cur; const s = [...cur.selection]; s[index] = e.target.value; return { ...cur, selection: s } })}>
                    <option value="">Elegir…</option>
                    {(comboChoices.get(combo.product.id) ?? []).map((choice) => (
                      <option key={choice.id} value={choice.id} disabled={combo.selection.includes(choice.id) && combo.selection[index] !== choice.id}>{choice.name}</option>
                    ))}
                  </NativeSelect>
                </FormField>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCombo(null)}>Cancelar</Button>
              <Button type="button" onClick={confirmCombo}>{combo.editingKey ? 'Guardar combo' : 'Agregar combo'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}