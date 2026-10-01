import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type MenuProduct = {
  id: string
  name: string
  description: string | null
  price: number
  is_available: boolean
  is_combo: boolean
  combo_slots: number | null
  category_id: string | null
  categories: { name: string } | null
}

export type MenuCategory = { id: string; name: string; is_active: boolean; sort_order: number }

export type ComboOption = {
  id: string
  combo_id: string
  option_id: string
  is_default: boolean
  sort_order: number
}

export type MenuData = {
  products: MenuProduct[]
  categories: MenuCategory[]
  comboOptions: ComboOption[]
}

export function useMenu() {
  return useQuery({
    queryKey: ['menu'],
    queryFn: async (): Promise<MenuData> => {
      const [productsResult, categoriesResult, comboResult] = await Promise.all([
        supabase
          .from('products')
          .select(
            'id, name, description, price, is_available, is_combo, combo_slots, category_id, categories(name)'
          )
          .order('name'),
        supabase.from('categories').select('id, name, is_active, sort_order').order('sort_order').order('name'),
        supabase.from('combo_options').select('id, combo_id, option_id, is_default, sort_order').order('sort_order'),
      ])
      const error = productsResult.error ?? categoriesResult.error ?? comboResult.error
      if (error) throw error
      return {
        products: (productsResult.data ?? []) as unknown as MenuProduct[],
        categories: (categoriesResult.data ?? []) as unknown as MenuCategory[],
        comboOptions: (comboResult.data ?? []) as unknown as ComboOption[],
      }
    },
  })
}
