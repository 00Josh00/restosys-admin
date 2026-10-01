import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { errorMessage, FormField, NativeSelect, PageError, PageLoading, PageShell, TextInput, useUserRole } from './shared'

type RestaurantTable = { id: string; name: string; capacity: number; status: 'libre' | 'ocupada' | 'reservada' }

const statusNames: Record<RestaurantTable['status'], string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  reservada: 'Reservada',
}

export function TablesPage() {
  const queryClient = useQueryClient()
  const role = useUserRole()
  const [open, setOpen] = useState(false)
  const query = useQuery({
    queryKey: ['restaurant-tables'],
    queryFn: async () => {
      const { data, error } = await supabase.from('restaurant_tables').select('*').order('name')
      if (error) throw error
      return (data ?? []) as RestaurantTable[]
    },
    refetchInterval: 30_000,
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RestaurantTable['status'] }) => {
      const { error } = await supabase.from('restaurant_tables').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] }),
    onError: (error) => toast.error(errorMessage(error)),
  })

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
    if (!window.confirm(`¿Eliminar ${table.name}?`)) return
    const { error } = await supabase.from('restaurant_tables').delete().eq('id', table.id)
    if (error) return toast.error(error.message)
    toast.success('Mesa eliminada')
    await queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] })
  }

  if (query.isPending) return <PageShell title='Mesas' description='Estado del salón en tiempo real'><PageLoading /></PageShell>
  if (query.error) return <PageShell title='Mesas'><PageError message={errorMessage(query.error)} /></PageShell>

  const occupied = query.data.filter((table) => table.status === 'ocupada').length
  const available = query.data.filter((table) => table.status === 'libre').length

  return (
    <PageShell
      title='Mesas'
      description={`${available} libres · ${occupied} ocupadas · ${query.data.length} en total`}
      action={role.data === 'admin' ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus /> Agregar mesa</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva mesa</DialogTitle></DialogHeader>
            <form id='table-form' onSubmit={addTable} className='grid gap-4'>
              <FormField label='Nombre'><TextInput name='name' required placeholder='Ej. Mesa 6' /></FormField>
              <FormField label='Capacidad'><TextInput name='capacity' type='number' min='1' max='30' defaultValue='4' required /></FormField>
            </form>
            <DialogFooter><Button type='submit' form='table-form'>Guardar mesa</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      ) : undefined}
    >
      {!query.data.length ? (
        <Card><CardContent className='py-10 text-center text-muted-foreground'>Todavía no hay mesas registradas.</CardContent></Card>
      ) : (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          {query.data.map((table) => (
            <Card key={table.id} className='overflow-hidden'>
              <CardHeader className='flex flex-row items-start justify-between space-y-0 pb-3'>
                <div>
                  <CardTitle className='text-lg'>{table.name}</CardTitle>
                  <p className='mt-1 flex items-center gap-1 text-sm text-muted-foreground'><UsersRound className='size-4' /> {table.capacity} personas</p>
                </div>
                {role.data === 'admin' && (
                  <Button variant='ghost' size='icon' aria-label={`Eliminar ${table.name}`} onClick={() => void removeTable(table)}><Trash2 className='size-4' /></Button>
                )}
              </CardHeader>
              <CardContent className='space-y-3'>
                <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${table.status === 'libre' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : table.status === 'ocupada' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
                  {statusNames[table.status]}
                </div>
                {role.data !== 'cocina' && (
                  <NativeSelect value={table.status} aria-label={`Estado de ${table.name}`} onChange={(event) => updateStatus.mutate({ id: table.id, status: event.target.value as RestaurantTable['status'] })}>
                    <option value='libre'>Libre</option>
                    <option value='ocupada'>Ocupada</option>
                    <option value='reservada'>Reservada</option>
                  </NativeSelect>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
