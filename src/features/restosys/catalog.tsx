import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
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
import { supabase } from '@/lib/supabase'
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

type Category = { id: string; name: string; is_active: boolean }
type Product = {
  id: string
  name: string
  description: string | null
  price: number
  is_available: boolean
  category_id: string | null
  categories: { name: string } | null
}

export function CatalogPage() {
  const queryClient = useQueryClient()
  const [productOpen, setProductOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const role = useUserRole()
  const query = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => {
      const [productsResult, categoriesResult] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, description, price, is_available, category_id, categories(name)')
          .order('name'),
        supabase.from('categories').select('id, name, is_active').order('sort_order').order('name'),
      ])
      const error = productsResult.error ?? categoriesResult.error
      if (error) throw error
      return {
        products: (productsResult.data ?? []) as unknown as Product[],
        categories: (categoriesResult.data ?? []) as Category[],
      }
    },
  })

  const toggleAvailability = useMutation({
    mutationFn: async ({ id, available }: { id: string; available: boolean }) => {
      const { error } = await supabase.from('products').update({ is_available: available }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog'] }),
    onError: (error) => toast.error(errorMessage(error)),
  })

  const addProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const { error } = await supabase.from('products').insert({
      name: String(form.get('name')).trim(),
      description: String(form.get('description') || '').trim() || null,
      price: Number(form.get('price')),
      category_id: String(form.get('category_id') || '') || null,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Producto agregado al catálogo')
    setProductOpen(false)
    event.currentTarget.reset()
    await queryClient.invalidateQueries({ queryKey: ['catalog'] })
  }

  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const { error } = await supabase.from('categories').insert({ name: String(form.get('name')).trim() })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Categoría creada')
    setCategoryOpen(false)
    event.currentTarget.reset()
    await queryClient.invalidateQueries({ queryKey: ['catalog'] })
  }

  if (query.isPending) return <PageShell title='Catálogo' description='Platos, bebidas y precios'><PageLoading /></PageShell>
  if (query.error) return <PageShell title='Catálogo'><PageError message={errorMessage(query.error)} /></PageShell>

  return (
    <PageShell
      title='Catálogo'
      description='Administra los platos, bebidas, categorías y precios.'
      action={role.data === 'admin' ? (
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
          <Dialog open={productOpen} onOpenChange={setProductOpen}>
            <DialogTrigger asChild><Button><Plus /> Agregar producto</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuevo producto</DialogTitle></DialogHeader>
              <form id='product-form' onSubmit={addProduct} className='grid gap-4'>
                <FormField label='Nombre'><TextInput name='name' required maxLength={120} placeholder='Ej. Ceviche clásico' /></FormField>
                <FormField label='Categoría'>
                  <NativeSelect name='category_id' defaultValue=''>
                    <option value=''>Sin categoría</option>
                    {query.data.categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </NativeSelect>
                </FormField>
                <FormField label='Precio (S/)'><TextInput name='price' type='number' step='0.01' min='0' required /></FormField>
                <FormField label='Descripción'><TextInput name='description' maxLength={300} placeholder='Descripción breve (opcional)' /></FormField>
              </form>
              <DialogFooter><Button type='submit' form='product-form'>Guardar producto</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : undefined}
    >
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {query.data.categories.map((category) => (
          <Card key={category.id} className='sm:col-span-2 xl:col-span-3'>
            <CardHeader className='pb-3'><CardTitle className='text-base'>{category.name}</CardTitle></CardHeader>
            <CardContent>
              <ProductList
                products={query.data.products.filter((product) => product.category_id === category.id)}
                canEdit={role.data === 'admin'}
                onToggle={(product) => toggleAvailability.mutate({ id: product.id, available: !product.is_available })}
              />
            </CardContent>
          </Card>
        ))}
        <Card className='sm:col-span-2 xl:col-span-3'>
          <CardHeader className='pb-3'><CardTitle className='text-base'>Sin categoría</CardTitle></CardHeader>
          <CardContent>
            <ProductList
              products={query.data.products.filter((product) => !product.category_id)}
              canEdit={role.data === 'admin'}
              onToggle={(product) => toggleAvailability.mutate({ id: product.id, available: !product.is_available })}
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}

function ProductList({
  products,
  canEdit,
  onToggle,
}: {
  products: Product[]
  canEdit: boolean
  onToggle: (product: Product) => void
}) {
  if (!products.length) return <EmptyState title='No hay productos en esta categoría' />
  return (
    <div className='divide-y'>
      {products.map((product) => (
        <div key={product.id} className='flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0'>
          <div className='min-w-0'>
            <p className='font-medium'>{product.name}</p>
            {product.description && <p className='text-sm text-muted-foreground'>{product.description}</p>}
          </div>
          <div className='flex items-center gap-3'>
            <span className='font-semibold'>{formatMoney(product.price)}</span>
            {canEdit ? (
              <Button size='sm' variant={product.is_available ? 'outline' : 'secondary'} onClick={() => onToggle(product)}>
                {product.is_available ? 'Disponible' : 'Agotado'}
              </Button>
            ) : <span className='text-sm text-muted-foreground'>{product.is_available ? 'Disponible' : 'Agotado'}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
