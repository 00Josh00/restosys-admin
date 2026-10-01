import { Link, useLocation } from '@tanstack/react-router'
import {
  Armchair,
  BarChart3,
  Boxes,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { to: '/', label: 'Panel', icon: LayoutDashboard },
  { to: '/catalogo', label: 'Catálogo', icon: UtensilsCrossed },
  { to: '/mesas', label: 'Mesas', icon: Armchair },
  { to: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/cocina', label: 'Cocina', icon: ChefHat },
  { to: '/gastos', label: 'Gastos', icon: Wallet },
  { to: '/inventario', label: 'Inventario', icon: Boxes },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/equipo', label: 'Equipo', icon: Users },
]

export function MobileNav() {
  const { pathname } = useLocation()

  return (
    <nav
      className='fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden'
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className='flex overflow-x-auto'>
        {items.map((item) => {
          const active =
            item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex min-w-16 flex-1 flex-col items-center gap-1 px-2 py-2 text-[11px] font-medium',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className='size-5' />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
