import { ContentSection } from '../components/content-section'
import { NotificationsForm } from './notifications-form'

export function SettingsNotifications() {
  return (
    <ContentSection
      title='Notificaciones'
      desc='Configura cómo quieres recibir las notificaciones.'
    >
      <NotificationsForm />
    </ContentSection>
  )
}
