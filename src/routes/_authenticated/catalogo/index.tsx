import { createFileRoute } from '@tanstack/react-router'
import { CatalogPage } from '@/features/restosys/catalog'

export const Route = createFileRoute('/_authenticated/catalogo/')({
  component: CatalogPage,
})
