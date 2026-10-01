import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { useMenu, type ComboOption, type MenuCategory, type MenuData, type MenuProduct } from './menu'
import {
  EmptyState,
  errorMessage,
  FormField,
  formatMoney,
  NativeSelect,
  PageError,
  PageLoading,
  PageShell,
  TextInput,
  useUserRole,
} from './shared'

export function CatalogPage() {
  const queryClient = useQueryClient()
  const role = useUserRole()
  const menu = useMenu()
  const [productDialog, setProductDialog] = useState<{ open: boolean; product: MenuProduct | null }>({ open: false, product: null })
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<MenuProduct | null>(null)
  const [categoryToDelete, setCategoryToDelete] = useState<MenuCategory | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['menu'] })

  const removeProduct = useMutation({
    mutationFn: async (product: MenuProduct) => {
      const { error } = await supabase.from('products').delete().eq('id', product.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success('Plato eliminado')
      setProductToDelete(null)
      void invalidate()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const removeCategory = useMutation({
    mutationFn: async (category: MenuCategory) => {
      const { error } = await supabase.from('categories').delete().eq('id', category.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success('Categoría eliminada')
      setCategoryToDelete(null)
      void invalidate()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const { error } = await supabase.from('categories').insert({ name: String(form.get('name')).trim() })
    if (error) return toast.error(error.message)
    toast.success('Categoría creada')
    setCategoryOpen(false)
    await invalidate()
  }

  if (menu.isPending) return <PageShell title='Catálogo' description='Platos, bebidas y precios'><PageLoading /></PageShell>
  if (menu.error) return <PageShell title='Catálogo'><PageError message={errorMessage(menu.error)} /></PageShell>

  const canEdit = role.data === 'admin'

  return (
    <PageShell
      title='Catálogo'
      description='Administra los platos, bebidas, categorías, precios y combos.'
      action={canEdit ? (
        <div className='flex flex-wrap gap-2'>
          <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
            <DialogTrigger asChild><Button variant='outline'>Nueva categoría</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Crear categoría</DialogTitle></DialogHeader>
              <form id='category-form' onSubmit={addCategory} className='grid gap-4'>
                <FormField label='Nombre'><TextInput name='name' required maxLength={60} placeholder='Ej. Ceviches' /></FormField>
              </form>
              <DialogFooter><Button type='submit' form='category-form'>Guardar categoría</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Button onClick={() => setProductDialog({ open: true, product: null })}><Plus /> Agregar producto</Button>
        </div>
      ) : undefined}
    >
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {menu.data.categories.map((category) => (
          <Card key={category.id} className='sm:col-span-2 xl:col-span-3'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-3'>
              <CardTitle className='text-base'>{category.name}</CardTitle>
              {canEdit && (
                <Button variant='ghost' size='icon' aria-label={`Eliminar categoría ${category.name}`} onClick={() => setCategoryToDelete(category)}>
                  <Trash2 className='size-4' />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <ProductList
                products={menu.data.products.filter((product) => product.category_id === category.id)}
                canEdit={canEdit}
                onToggle={(product) => void toggleAvailability(product, invalidate)}
                onEdit={(product) => setProductDialog({ open: true, product })}
                onDelete={setProductToDelete}
              />
            </CardContent>
          </Card>
        ))}
        <Card className='sm:col-span-2 xl:col-span-3'>
          <CardHeader className='pb-3'><CardTitle className='text-base'>Sin categoría</CardTitle></CardHeader>
          <CardContent>
            <ProductList
              products={menu.data.products.filter((product) => !product.category_id)}
              canEdit={canEdit}
              onToggle={(product) => void toggleAvailability(product, invalidate)}
              onEdit={(product) => setProductDialog({ open: true, product })}
              onDelete={setProductToDelete}
            />
          </CardContent>
        </Card>
      </div>

      {productDialog.open && (
        <ProductDialog
          key={productDialog.product?.id ?? 'new'}
          open={productDialog.open}
          product={productDialog.product}
          data={menu.data}
          onOpenChange={(open) => setProductDialog((current) => ({ ...current, open }))}
          onSaved={invalidate}
        />
      )}

      <ConfirmDialog
        open={Boolean(productToDelete)}
        onOpenChange={(open) => !open && setProductToDelete(null)}
        title='Eliminar plato'
        desc={productToDelete ? `¿Seguro que quieres eliminar "${productToDelete.name}"? Esta acción no se puede deshacer.` : ''}
        confirmText='Eliminar'
        cancelBtnText='Cancelar'
        destructive
        isLoading={removeProduct.isPending}
        handleConfirm={() => productToDelete && removeProduct.mutate(productToDelete)}
      />

      <ConfirmDialog
        open={Boolean(categoryToDelete)}
        onOpenChange={(open) => !open && setCategoryToDelete(null)}
        title='Eliminar categoría'
        desc={categoryToDelete ? `¿Eliminar "${categoryToDelete.name}"? Los platos quedarán sin categoría.` : ''}
        confirmText='Eliminar'
        cancelBtnText='Cancelar'
        destructive
        isLoading={removeCategory.isPending}
        handleConfirm={() => categoryToDelete && removeCategory.mutate(categoryToDelete)}
      />
    </PageShell>
  )
}

async function toggleAvailability(product: MenuProduct, invalidate: () => void) {
  const { error } = await supabase.from('products').update({ is_available: !product.is_available }).eq('id', product.id)
  if (error) {
    toast.error(error.message)
    return
  }
  invalidate()
}

function ProductList({
  products,
  canEdit,
  onToggle,
  onEdit,
  onDelete,
}: {
  products: MenuProduct[]
  canEdit: boolean
  onToggle: (product: MenuProduct) => void
  onEdit: (product: MenuProduct) => void
  onDelete: (product: MenuProduct) => void
}) {
  if (!products.length) return <EmptyState title='No hay productos en esta categoría' />
  return (
    <div className='divide-y'>
      {products.map((product) => (
        <div key={product.id} className='flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0'>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <p className='font-medium'>{product.name}</p>
              {product.is_combo && <Badge variant='secondary'>{product.combo_slots === 3 ? 'Trío' : 'Dúo'}</Badge>}
            </div>
            {product.description && <p className='text-sm text-muted-foreground'>{product.description}</p>}
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-semibold'>{formatMoney(product.price)}</span>
            {canEdit ? (
              <>
                <Button size='sm' variant='outline' onClick={() => onToggle(product)}>
                  {product.is_available ? 'Disponible' : 'Agotado'}
                </Button>
                <Button size='sm' variant='secondary' onClick={() => onEdit(product)}>
                  <Pencil /> Editar
                </Button>
                <Button size='icon' variant='ghost' aria-label={`Eliminar ${product.name}`} onClick={() => onDelete(product)}>
                  <Trash2 className='size-4' />
                </Button>
              </>
            ) : <span className='text-sm text-muted-foreground'>{product.is_available ? 'Disponible' : 'Agotado'}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function ProductDialog({
  open,
  onOpenChange,
  product,
  data,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: MenuProduct | null
  data: MenuData
  onSaved: () => void
}) {
  const isEdit = Boolean(product)
  const initialOptions: ComboOption[] = product ? data.comboOptions.filter((option) => option.combo_id === product.id) : []

  const [name, setName] = useState(product?.name ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '')
  const [isAvailable, setIsAvailable] = useState(product?.is_available ?? true)
  const [isCombo, setIsCombo] = useState(product?.is_combo ?? false)
  const [slots, setSlots] = useState<'2' | '3'>(String(product?.combo_slots ?? 2) as '2' | '3')
  const [optionIds, setOptionIds] = useState<string[]>(initialOptions.map((option) => option.option_id))
  const [defaultIds, setDefaultIds] = useState<string[]>(initialOptions.filter((option) => option.is_default).map((option) => option.option_id))

  const candidates = useMemo(
    () => data.products.filter((item) => item.id !== product?.id && !item.is_combo),
    [data.products, product?.id]
  )
  const slotsNumber = Number(slots)

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('El nombre es obligatorio.')
      const numericPrice = Number(price)
      if (Number.isNaN(numericPrice) || numericPrice < 0) throw new Error('Ingresa un precio válido.')
      if (isCombo && optionIds.length < slotsNumber) throw new Error(`Elige al menos ${slotsNumber} opciones permitidas para el combo.`)

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        price: numericPrice,
        category_id: categoryId || null,
        is_available: isAvailable,
        is_combo: isCombo,
        combo_slots: isCombo ? slotsNumber : null,
      }

      const result = product
        ? await supabase.from('products').update(payload).eq('id', product.id).select('id').single()
        : await supabase.from('products').insert(payload).select('id').single()
      if (result.error || !result.data) throw new Error(result.error?.message ?? 'No se pudo guardar el plato.')

      const productId = result.data.id
      const { error: clearError } = await supabase.from('combo_options').delete().eq('combo_id', productId)
      if (clearError) throw new Error(clearError.message)

      if (isCombo && optionIds.length) {
        const rows = optionIds.map((optionId, index) => ({
          combo_id: productId,
          option_id: optionId,
          is_default: defaultIds.includes(optionId),
          sort_order: index,
        }))
        const { error: optionsError } = await supabase.from('combo_options').insert(rows)
        if (optionsError) throw new Error(optionsError.message)
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Plato actualizado' : 'Plato agregado al catálogo')
      onSaved()
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const toggleOption = (optionId: string) => {
    setOptionIds((current) => (current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]))
    setDefaultIds((current) => (optionIds.includes(optionId) ? current.filter((id) => id !== optionId) : current))
  }

  const toggleDefault = (optionId: string) => {
    setDefaultIds((current) => (current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader><DialogTitle>{isEdit ? 'Editar plato' : 'Nuevo plato'}</DialogTitle></DialogHeader>
        <form id='product-form' onSubmit={(event) => { event.preventDefault(); save.mutate() }} className='grid gap-4'>
          <FormField label='Nombre'><TextInput value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder='Ej. Ceviche clásico' /></FormField>
          <FormField label='Categoría'>
            <NativeSelect value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value=''>Sin categoría</option>
              {data.categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </NativeSelect>
          </FormField>
          <FormField label='Precio (S/)'><TextInput value={price} onChange={(event) => setPrice(event.target.value)} type='number' step='0.01' min='0' required /></FormField>
          <FormField label='Descripción'><TextInput value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} placeholder='Descripción breve (opcional)' /></FormField>

          <label className='flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium'>
            Disponible para vender
            <Checkbox checked={isAvailable} onCheckedChange={(checked) => setIsAvailable(checked === true)} />
          </label>

          <label className='flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium'>
            Es combo (arma tu trío / dúo)
            <Checkbox
              checked={isCombo}
              onCheckedChange={(checked) => {
                const next = checked === true
                setIsCombo(next)
                if (!next) setDefaultIds([])
              }}
            />
          </label>

          {isCombo && (
            <div className='grid gap-3'>
              <FormField label='Tamaño del combo'>
                <NativeSelect value={slots} onChange={(event) => setSlots(event.target.value as '2' | '3')}>
                  <option value='2'>Dúo (2 platos)</option>
                  <option value='3'>Trío (3 platos)</option>
                </NativeSelect>
              </FormField>
              <div>
                <p className='mb-1 text-sm font-medium'>Opciones permitidas y por defecto</p>
                <p className='mb-2 text-xs text-muted-foreground'>Marca “Incluir” para permitir el plato y “Def.” para que venga elegido.</p>
                {!candidates.length ? (
                  <p className='text-sm text-muted-foreground'>Primero registra otros platos.</p>
                ) : (
                  <div className='divide-y rounded-lg border'>
                    {candidates.map((candidate) => {
                      const included = optionIds.includes(candidate.id)
                      return (
                        <div key={candidate.id} className='flex items-center justify-between gap-3 px-3 py-2'>
                          <span className='min-w-0 truncate text-sm'>{candidate.name}</span>
                          <div className='flex items-center gap-4'>
                            <label className='flex items-center gap-2 text-xs font-medium'>
                              <Checkbox checked={included} onCheckedChange={() => toggleOption(candidate.id)} /> Incluir
                            </label>
                            <label className={`flex items-center gap-2 text-xs font-medium ${included ? '' : 'opacity-40'}`}>
                              <Checkbox checked={defaultIds.includes(candidate.id)} disabled={!included} onCheckedChange={() => toggleDefault(candidate.id)} /> Def.
                            </label>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </form>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type='submit' form='product-form' disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
