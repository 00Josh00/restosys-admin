'use client'

import { useState, useMemo, type FormEvent } from 'react'
import { Minus, Plus, X, Search, UtensilsCrossed, Wine, Coffee, ChefHat, Package, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

interface CartSummaryProps {
  lines: CartLine[]
  subtotal: number
  onClear: () => void
  onUpdateQty: (key: string, delta: number) => void
  onRemove: (key: string) => void
  onEditCombo: (line: CartLine) => void
  formatMoney: (value: number) => string
}

function CartSummary({
  lines,
  subtotal,
  onClear,
  onUpdateQty,
  onRemove,
  onEditCombo,
  formatMoney,
}: CartSummaryProps) {
  if (lines.length === 0) {
    return (
      <div className="bg-muted/30 rounded-lg p-3 text-center text-sm text-muted-foreground">
        <Package className="size-6 mx-auto mb-1 opacity-50" />
        <p>El pedido está vacío</p>
        <p className="text-xs">Selecciona productos abajo</p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">Pedido ({lines.length})</h3>
        <Button type="button" variant="ghost" size="icon" onClick={onClear} aria-label="Limpiar pedido" className="size-7">
          <X className="size-4" />
        </Button>
      </div>
      <div className="divide-y max-h-40 overflow-y-auto">
        {lines.map((line) => (
          <div key={line.key} className="py-2 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="font-medium text-sm">{line.quantity}×</span>
                <span className="font-medium text-sm truncate">{line.product.name}</span>
                {line.product.is_combo && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary">
                    <Package className="size-2.5" /> {line.product.combo_slots === 3 ? 'Trío' : 'Dúo'}
                  </span>
                )}
              </div>
              <span className="font-semibold text-sm whitespace-nowrap">{formatMoney(Number(line.product.price) * line.quantity)}</span>
            </div>
            {line.components.length > 0 && (
              <p className="ml-6 text-xs text-muted-foreground">{line.components.map((c) => c.name).join(' + ')}</p>
            )}
            <div className="flex items-center gap-1 ml-6">
              <Button type="button" size="icon" variant="outline" className="size-7" onClick={() => onUpdateQty(line.key, -1)} aria-label="Disminuir"><Minus className="size-3.5" /></Button>
              <span className="w-7 text-center text-sm font-medium">{line.quantity}</span>
              <Button type="button" size="icon" variant="outline" className="size-7" onClick={() => onUpdateQty(line.key, 1)} aria-label="Aumentar"><Plus className="size-3.5" /></Button>
              <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive hover:bg-destructive/10" onClick={() => onRemove(line.key)} aria-label="Eliminar"><Trash2 className="size-3.5" /></Button>
              {line.product.is_combo && (
                <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => onEditCombo(line)} aria-label="Modificar combo"><X className="size-3.5" /></Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 border-t pt-2 space-y-1">
        <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-semibold">{formatMoney(subtotal)}</span></div>
        <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatMoney(subtotal)}</span></div>
      </div>
    </div>
  )
}

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
    if (c === 'dúos' || c === 'duos') return Package
    if (c === 'tríos' || c === 'trios') return Package
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
        <DialogContent className="max-h-[90dvh] w-full max-w-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <form id="order-form" onSubmit={submit} className="flex flex-col gap-3 min-h-0 h-[calc(90dvh-3rem)]">
            <DialogHeader className="flex flex-col gap-3">
              <DialogTitle className="text-lg">
                {isAppend ? `Agregar platos · Pedido #${order?.order_number ?? ''}` : 'Crear pedido'}
              </DialogTitle>
              {!isAppend && !initialTableId && (
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Tipo">
                    <NativeSelect name="order_type" defaultValue="local">
                      <option value="local">🍽️ En local</option>
                      <option value="llevar">📦 Para llevar</option>
                      <option value="delivery">🚚 Delivery</option>
                    </NativeSelect>
                  </FormField>
                  <FormField label="Mesa">
                    <NativeSelect name="table_id" defaultValue="">
                      <option value="">Seleccionar</option>
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

            <CartSummary
              lines={lines}
              subtotal={subtotal}
              onClear={() => setLines([])}
              onUpdateQty={(key, delta) => setLines((c) => c.map((i) => i.key === key ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))}
              onRemove={(key) => setLines((c) => c.filter((i) => i.key !== key))}
              onEditCombo={(line) => setCombo({ product: line.product, editingKey: line.key, selection: line.components.map((c) => c.id) })}
              formatMoney={formatMoney}
            />

            <div className="flex flex-col gap-2">
              <div className="relative">
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
                <button type="button" role="tab" aria-selected={activeCategory === 'Todos'} onClick={() => setActiveCategory('Todos')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${activeCategory === 'Todos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
                  <Search className="size-3.5" /> Todos
                </button>
                {categories.slice(1).map((cat) => {
                  const Icon = getCategoryIcon(cat)
                  return (
                    <button key={cat} type="button" role="tab" aria-selected={activeCategory === cat} onClick={() => setActiveCategory(cat)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${activeCategory === cat ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
                      <Icon className="size-3.5" /> {cat}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                  <Search className="size-12 mb-2 opacity-50" />
                  <p>No hay productos en esta categoría</p>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredProducts.map((product: MenuProduct) => (
                    <button key={product.id} type="button" onClick={() => addToCart(product)} className="group relative flex items-center justify-between gap-2 p-2 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-accent/50 transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none min-h-[48px]">
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <h4 className="font-medium text-sm truncate">{product.name}</h4>
                        {product.is_combo && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary">
                            <Package className="size-2.5" /> {product.combo_slots === 3 ? 'Trío' : 'Dúo'}
                          </span>
                        )}
                        <span className="font-semibold text-primary text-sm ml-auto whitespace-nowrap">{formatMoney(product.price)}</span>
                      </div>
                      <div className="flex items-center justify-center size-8 rounded-full bg-primary/10 text-primary shrink-0">
                        <Plus className="size-3.5" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!isAppend && !initialTableId && (
              <div className="grid gap-2 border-t pt-3">
                <FormField label="Cliente (opcional)"><TextInput name="customer_name" placeholder="Nombre del cliente" /></FormField>
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Dirección delivery"><TextInput name="delivery_address" placeholder="Dirección" /></FormField>
                  <FormField label="Costo delivery (S/)"><TextInput name="delivery_fee" type="number" min="0" step="0.5" defaultValue="0" /></FormField>
                </div>
              </div>
            )}
            {!isAppend && (
              <FormField label="Notas para cocina (opcional)"><TextInput name="notes" placeholder="Ej. sin ají" /></FormField>
            )}

            <DialogFooter className="flex flex-col sm:flex-row gap-2 w-full pt-1">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={!canSubmit} className="w-full sm:w-auto">
                {saving ? 'Guardando…' : isAppend ? 'Agregar platos' : 'Enviar a cocina'}
              </Button>
            </DialogFooter>
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
