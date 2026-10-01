/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import {
  formatDateTimeInLima,
  formatDateInLima,
  formatTimeInLima,
} from '@/lib/timezone'

export function PageShell({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>
      <Main className='flex flex-1 flex-col gap-5 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
            {description && (
              <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
            )}
          </div>
          {action}
        </div>
        {children}
      </Main>
    </>
  )
}

export function PageLoading({ label = 'Cargando información…' }: { label?: string }) {
  return (
    <div className='flex min-h-40 items-center justify-center text-sm text-muted-foreground'>
      {label}
    </div>
  )
}

export function PageError({ message }: { message: string }) {
  return (
    <Card className='border-destructive/40'>
      <CardHeader>
        <CardTitle className='text-base'>No se pudieron cargar los datos</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <p className='text-sm text-muted-foreground'>{message}</p>
        <p className='text-sm text-muted-foreground'>
          Revisa la conexión, los permisos RLS y que las migraciones estén aplicadas.
        </p>
      </CardContent>
    </Card>
  )
}

export function EmptyState({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className='rounded-xl border border-dashed p-8 text-center'>
      <p className='font-medium'>{title}</p>
      {description && (
        <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
      )}
    </div>
  )
}

export function MetricCard({
  title,
  value,
  detail,
}: {
  title: string
  value: ReactNode
  detail?: string
}) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{value}</div>
        {detail && <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>}
      </CardContent>
    </Card>
  )
}

export function useUserRole() {
  const user = useAuthStore((state) => state.auth.user)
  return useQuery({
    queryKey: ['profile-role', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user!.id)
        .maybeSingle()
      if (error) throw error
      return (data?.role as 'admin' | 'mesero' | 'cocina' | undefined) ?? 'mesero'
    },
  })
}

export function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(Number(value ?? 0))
}

export function formatDateTime(value: string) {
  return formatDateTimeInLima(value)
}

export function formatDate(value: string) {
  return formatDateInLima(value)
}

export function formatTime(value: string) {
  return formatTimeInLima(value)
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
}

export function FormField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className='grid gap-2 text-sm font-medium'>
      {label}
      {children}
    </label>
  )
}

export function TextInput(props: React.ComponentProps<'input'>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring min-h-[44px] ${props.className ?? ''}`}
    />
  )
}

export function NativeSelect(props: React.ComponentProps<'select'>) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px] ${props.className ?? ''}`}
    />
  )
}
