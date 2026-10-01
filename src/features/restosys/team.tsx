import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { EmptyState, errorMessage, NativeSelect, PageError, PageLoading, PageShell, TextInput, useUserRole } from './shared'

type Profile = { id: string; full_name: string; email: string | null; role: 'admin' | 'mesero' | 'cocina'; created_at: string }

const roleLabels = { admin: 'Administrador', mesero: 'Mesero', cocina: 'Cocina' } as const

export function TeamPage() {
  const queryClient = useQueryClient()
  const role = useUserRole()
  const [search, setSearch] = useState('')
  const query = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email, role, created_at').order('created_at')
      if (error) throw error
      return (data ?? []) as Profile[]
    },
  })

  const updateRole = useMutation({
    mutationFn: async ({ id, role: nextRole }: { id: string; role: Profile['role'] }) => {
      const { error } = await supabase.from('profiles').update({ role: nextRole }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Rol actualizado')
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
      void queryClient.invalidateQueries({ queryKey: ['profile-role'] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const profiles = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return query.data ?? []
    return (query.data ?? []).filter(
      (profile) =>
        profile.full_name.toLowerCase().includes(term) ||
        (profile.email ?? '').toLowerCase().includes(term),
    )
  }, [query.data, search])

  if (query.isPending) return <PageShell title='Equipo' description='Gestiona los usuarios y sus roles (admin, mesero, cocina).'><PageLoading /></PageShell>
  if (query.error) return <PageShell title='Equipo'><PageError message={errorMessage(query.error)} /></PageShell>

  const isAdmin = role.data === 'admin'

  return (
    <PageShell title='Equipo' description='Gestiona los usuarios y sus roles (admin, mesero, cocina).'>
      <div className='relative max-w-md'>
        <Search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
        <TextInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder='Buscar por nombre o correo'
          className='pl-9'
          aria-label='Buscar usuario'
        />
      </div>

      {!query.data.length ? <EmptyState title='Sin usuarios' /> : !profiles.length ? (
        <EmptyState title='Sin resultados' description='Ningún usuario coincide con la búsqueda.' />
      ) : (
        <Card>
          <CardHeader><CardTitle className='text-base'>Usuarios registrados ({profiles.length})</CardTitle></CardHeader>
          <CardContent className='divide-y'>
            {profiles.map((profile) => {
              const initials = profile.full_name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()
              return (
                <div key={profile.id} className='flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0'>
                  <div className='flex min-w-0 items-center gap-3'>
                    <Avatar><AvatarFallback>{initials}</AvatarFallback></Avatar>
                    <div className='min-w-0'>
                      <p className='truncate font-medium'>{profile.full_name || 'Usuario'}</p>
                      <p className='truncate text-xs text-muted-foreground'>{profile.email ?? 'Sin correo'}</p>
                      <p className='text-xs text-muted-foreground'>Alta: {new Date(profile.created_at).toLocaleDateString('es-PE')}</p>
                    </div>
                  </div>
                  {isAdmin ? (
                    <NativeSelect className='w-auto min-w-40' aria-label={`Rol de ${profile.full_name}`} value={profile.role} onChange={(event) => updateRole.mutate({ id: profile.id, role: event.target.value as Profile['role'] })}>
                      <option value='admin'>Administrador</option>
                      <option value='mesero'>Mesero</option>
                      <option value='cocina'>Cocina</option>
                    </NativeSelect>
                  ) : <span className='flex items-center gap-1 text-sm text-muted-foreground'><ShieldCheck className='size-4' /> {roleLabels[profile.role]}</span>}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </PageShell>
  )
}
