import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
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
import {
  EmptyState,
  errorMessage,
  FormField,
  formatMoney,
  MetricCard,
  PageError,
  PageLoading,
  PageShell,
  TextInput,
  useUserRole,
} from './shared'

type Expense = {
  id: string
  amount: number
  note: string | null
  expense_date: string
  created_at: string
}

function today() {
  return new Date().toLocaleDateString('en-CA')
}

export function ExpensesPage() {
  const queryClient = useQueryClient()
  const role = useUserRole()
  const [date, setDate] = useState(today())
  const [open, setOpen] = useState(false)
  const query = useQuery({
    queryKey: ['expenses', date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, amount, note, expense_date, created_at')
        .eq('expense_date', date)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Expense[]
    },
  })

  const addExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error } = await supabase.from('expenses').insert({
      amount: Number(form.get('amount')),
      note: String(form.get('note') || '').trim() || null,
      expense_date: date,
      created_by: user?.id ?? null,
    })
    if (error) return toast.error(error.message)
    toast.success('Gasto registrado')
    setOpen(false)
    await queryClient.invalidateQueries({ queryKey: ['expenses'] })
  }

  const removeExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (query.isPending)
    return (
      <PageShell title='Gastos' description='Compras y salidas de caja'>
        <PageLoading />
      </PageShell>
    )
  if (query.error)
    return (
      <PageShell title='Gastos'>
        <PageError message={errorMessage(query.error)} />
      </PageShell>
    )

  const total = query.data.reduce(
    (sum, expense) => sum + Number(expense.amount),
    0
  )
  const canCreate = role.data === 'admin' || role.data === 'mesero'

  return (
    <PageShell
      title='Gastos'
      description='Registra las compras y salidas de caja del día.'
      action={
        canCreate ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={date !== today()}>
                <Plus /> Registrar gasto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo gasto</DialogTitle>
              </DialogHeader>
              <form
                id='expense-form'
                onSubmit={addExpense}
                className='grid gap-4'
              >
                <FormField label='Monto (S/)'>
                  <TextInput
                    name='amount'
                    type='number'
                    min='0.01'
                    step='0.01'
                    required
                  />
                </FormField>
                <FormField label='Nota'>
                  <TextInput
                    name='note'
                    placeholder='Ej. compra de pescado'
                    maxLength={200}
                  />
                </FormField>
              </form>
              <DialogFooter>
                <Button type='submit' form='expense-form'>
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      <div className='flex flex-wrap items-end gap-3'>
        <FormField label='Fecha'>
          <TextInput
            type='date'
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </FormField>
      </div>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          title='Total del día'
          value={formatMoney(total)}
          detail={`${query.data.length} movimientos`}
        />
      </div>
      {!query.data.length ? (
        <EmptyState title='Sin gastos en esta fecha' />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Movimientos</CardTitle>
          </CardHeader>
          <CardContent className='divide-y'>
            {query.data.map((expense) => (
              <div
                key={expense.id}
                className='flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0'
              >
                <div className='min-w-0'>
                  <p className='font-medium'>{expense.note || 'Gasto'}</p>
                  <p className='text-xs text-muted-foreground'>
                    {new Date(expense.created_at).toLocaleTimeString('es-PE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className='flex items-center gap-3'>
                  <span className='font-semibold'>
                    {formatMoney(expense.amount)}
                  </span>
                  {role.data === 'admin' && (
                    <Button
                      variant='ghost'
                      size='icon'
                      aria-label='Eliminar gasto'
                      onClick={() => removeExpense.mutate(expense.id)}
                    >
                      <Trash2 className='size-4' />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </PageShell>
  )
}
