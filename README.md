# RestoSys Admin

Panel de gestión para cevicherías y restaurantes, construido con **Vite + React + shadcn/ui** y conectado a **Supabase** (Postgres, Auth, RLS, Realtime). Es un front **independiente** del app Next.js de `restosys`, pero usa la **misma base de datos**.

Pensado para usarse **desde el celular**: mobile-first, PWA (instalable) e interfaz en español.

## Stack

- **UI:** [shadcn/ui](https://ui.shadcn.com) (Tailwind CSS v4 + Radix UI)
- **Build:** [Vite](https://vitejs.dev/)
- **Rutas:** [TanStack Router](https://tanstack.com/router/latest)
- **Data fetching:** [TanStack Query](https://tanstack.com/query/latest)
- **Backend/BD:** [Supabase](https://supabase.com) (Auth + Postgres + RLS + Realtime)
- **Formularios:** react-hook-form + Zod
- **Íconos:** Lucide
- **PWA:** manifest + service worker propios

## Módulos

- **Panel** — ventas cobradas, pedidos abiertos, mesas ocupadas y gastos del día.
- **Catálogo** — productos por categoría, precios y disponibilidad (admin).
- **Mesas** — estado del salón en tiempo real.
- **Pedidos** — crear pedidos (local/llevar/delivery), cambio de estado y cobro.
- **Cocina** — cola KDS en realtime (pendiente → preparación → listo).
- **Gastos** — salidas de caja por fecha.
- **Inventario** — insumos, stock mínimo y movimientos (entrada/salida/ajuste).
- **Reportes** — ventas por día/tipo, top platos y balance (solo admin).
- **Equipo** — gestión de usuarios y roles (admin/mesero/cocina).

## Requisitos

- Node 18+ y pnpm
- Un proyecto de Supabase

## Variables de entorno

Copia `.env.example` como `.env.local` y completa:

```bash
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-publishable-key
```

## Correr local

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

Para probar en el celular (misma red):

```bash
pnpm dev --host
```

## Scripts

```bash
pnpm dev        # desarrollo
pnpm build      # typecheck + build de producción (output: dist/)
pnpm preview    # sirve el build
pnpm lint       # eslint
```

## Estructura

```
src/
  components/     # UI (shadcn), layout, mobile-nav
  features/
    auth/         # login, registro, recuperación (Supabase Auth)
    restosys/     # módulos del negocio (panel, catálogo, pedidos, etc.)
    settings/     # ajustes de la cuenta
  lib/            # cliente de Supabase, utilidades
  stores/         # estado de sesión (zustand)
public/
  manifest.webmanifest
  sw.js
  icons/
```

## Despliegue en Vercel

1. Importa el repo en Vercel.
2. **Framework Preset:** Vite.
3. **Build Command:** `pnpm build` · **Output Directory:** `dist`.
4. Agrega las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Notas

- La seguridad depende de **RLS** en Supabase; el frontend no es la barrera.
- El alta de usuarios se hace desde el **Supabase Dashboard** (Authentication → Users); luego se asigna el rol en **Equipo**.
- Licencia MIT.
