import { ContentSection } from '../components/content-section'
import { DisplayForm } from './display-form'

export function SettingsDisplay() {
  return (
    <ContentSection
      title='Pantalla'
      desc='Activa o desactiva elementos para controlar qué se muestra en la app.'
    >
      <DisplayForm />
    </ContentSection>
  )
}
