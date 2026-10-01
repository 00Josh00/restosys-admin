import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { supabase } from '@/lib/supabase'
import { ErrorBoundary } from '@/components/error-boundary'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.href },
      })
    }
  },
  component: () => (
    <ErrorBoundary>
      <AuthenticatedLayout />
    </ErrorBoundary>
  ),
})
