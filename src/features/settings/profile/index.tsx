import { ContentSection } from '../components/content-section'
import { ProfileForm } from './profile-form'

export function SettingsProfile() {
  return (
    <ContentSection title='Perfil' desc='Así te verán los demás en el sitio.'>
      <ProfileForm />
    </ContentSection>
  )
}
