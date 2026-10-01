import { type User } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

async function importAuthStore() {
  const { useAuthStore } = await import('./auth-store')
  return useAuthStore
}

const sampleUser = {
  id: 'user-1',
  email: 'user@example.com',
} as unknown as User

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('starts with no signed-in user', async () => {
    const useAuthStore = await importAuthStore()

    expect(useAuthStore.getState().auth.user).toBeNull()
  })

  it('updates the signed-in user via setUser', async () => {
    const useAuthStore = await importAuthStore()

    useAuthStore.getState().auth.setUser(sampleUser)

    expect(useAuthStore.getState().auth.user).toEqual(sampleUser)
  })

  it('clears the signed-in user when reset is used', async () => {
    const useAuthStore = await importAuthStore()
    useAuthStore.getState().auth.setUser(sampleUser)

    useAuthStore.getState().auth.reset()

    expect(useAuthStore.getState().auth.user).toBeNull()
  })
})
