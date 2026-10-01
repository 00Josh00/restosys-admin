import {
  Armchair,
  BarChart3,
  Bell,
  Boxes,
  ChefHat,
  ClipboardList,
  Command,
  LayoutDashboard,
  Monitor,
  Palette,
  Settings,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  Wrench,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'RestoSys',
    email: 'admin@restosys.com',
    avatar: '',
  },
  teams: [
    {
      name: 'RestoSys',
      logo: Command,
      plan: 'Cevichería',
    },
  ],
  navGroups: [
    {
      title: 'Operación',
      items: [
        {
          title: 'Panel',
          url: '/',
          icon: LayoutDashboard,
        },
        {
          title: 'Catálogo',
          url: '/catalogo',
          icon: UtensilsCrossed,
        },
        {
          title: 'Mesas',
          url: '/mesas',
          icon: Armchair,
        },
        {
          title: 'Pedidos',
          url: '/pedidos',
          icon: ClipboardList,
        },
        {
          title: 'Cocina',
          url: '/cocina',
          icon: ChefHat,
        },
      ],
    },
    {
      title: 'Administración',
      items: [
        {
          title: 'Gastos',
          url: '/gastos',
          icon: Wallet,
        },
        {
          title: 'Inventario',
          url: '/inventario',
          icon: Boxes,
        },
        {
          title: 'Reportes',
          url: '/reportes',
          icon: BarChart3,
        },
        {
          title: 'Equipo',
          url: '/equipo',
          icon: Users,
        },
      ],
    },
    {
      title: 'Sistema',
      items: [
        {
          title: 'Configuración',
          icon: Settings,
          items: [
            {
              title: 'Perfil',
              url: '/settings',
              icon: UserCog,
            },
            {
              title: 'Apariencia',
              url: '/settings/appearance',
              icon: Palette,
            },
            {
              title: 'Notificaciones',
              url: '/settings/notifications',
              icon: Bell,
            },
            {
              title: 'Pantalla',
              url: '/settings/display',
              icon: Monitor,
            },
            {
              title: 'Cuenta',
              url: '/settings/account',
              icon: Wrench,
            },
          ],
        },
      ],
    },
  ],
}
