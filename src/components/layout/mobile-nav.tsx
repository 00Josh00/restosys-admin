import { useState } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import {
  Armchair,
  BarChart3,
  Boxes,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  MoreHorizontal,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

const PRIMARY_ITEMS = [
  { to: '/', label: 'Panel', icon: LayoutDashboard },
  { to: '/mesas', label: 'Mesas', icon: Armchair },
  { to: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/cocina', label: 'Cocina', icon: ChefHat },
  { to: '/catalogo', label: 'Catálogo', icon: UtensilsCrossed },
]

const SECONDARY_ITEMS = [
  { to: '/gastos', label: 'Gastos', icon: Wallet },
  { to: '/inventario', label: 'Inventario', icon: Boxes },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/equipo', label: 'Equipo', icon: Users },
]

export function MobileNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)

  const isActive = (to: string) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to)

  const handleNavigate = (to: string) => {
    navigate({ to })
    setSheetOpen(false)
  }

  return (
    <>
      <nav
        className='fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden'
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <div className='flex'>
          {PRIMARY_ITEMS.map((item) => {
            const active = isActive(item.to)
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex min-h-[44px] min-w-0 min-w-[44px] flex-1 flex-col items-center gap-1 px-3 py-2.5 text-[11px] font-medium',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
                onClick={() => handleNavigate(item.to)}
              >
                <Icon className='size-6' aria-hidden='true' />
                <span className='truncate text-center'>{item.label}</span>
              </Link>
            )
          })}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  'flex min-h-[44px] min-w-0 min-w-[44px] flex-1 flex-col items-center gap-1 px-3 py-2.5 text-[11px] font-medium text-muted-foreground'
                )}
                aria-label='Más opciones'
              >
                <MoreHorizontal className='size-6' aria-hidden='true' />
                <span className='truncate text-center'>Más</span>
              </button>
            </SheetTrigger>
            <SheetContent
              className='p-0'
              side='bottom'
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className='grid gap-1 p-4'>
                {SECONDARY_ITEMS.map((item) => {
                  const active = isActive(item.to)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        'flex min-h-[48px] items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent'
                      )}
                      onClick={() => handleNavigate(item.to)}
                    >
                      <Icon className='size-5' aria-hidden='true' />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  )
}
