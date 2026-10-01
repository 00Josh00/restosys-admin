import { type User } from '@supabase/supabase-js'
import { create } from 'zustand'

interface AuthState {
  auth: {
    user: User | null
    setUser: (user: User | null) => void
    reset: () => void
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  auth: {
    user: null,
    setUser: (user) => set((state) => ({ auth: { ...state.auth, user } })),
    reset: () => set((state) => ({ auth: { ...state.auth, user: null } })),
  },
}))
