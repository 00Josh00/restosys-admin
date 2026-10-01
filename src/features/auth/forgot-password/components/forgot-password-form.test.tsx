import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { userEvent, type Locator } from 'vitest/browser'
import { ForgotPasswordForm } from './forgot-password-form'

const navigateMock = vi.fn()
const resetPasswordForEmail = vi.fn()

vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (email: string, options: unknown) =>
        resetPasswordForEmail(email, options),
    },
  },
}))

describe('ForgotPasswordForm', () => {
  let screen: RenderResult
  let emailInput: Locator
  let continueButton: Locator

  beforeEach(async () => {
    vi.clearAllMocks()
    resetPasswordForEmail.mockResolvedValue({ error: null })

    screen = await render(<ForgotPasswordForm />)
    emailInput = screen.getByRole('textbox', { name: /^Correo$/i })
    continueButton = screen.getByRole('button', { name: /^Continuar$/i })
  })

  it('renders email field and continue button', async () => {
    await expect.element(emailInput).toBeInTheDocument()
    await expect.element(continueButton).toBeInTheDocument()
  })

  it('shows validation when submitting empty form', async () => {
    await userEvent.click(continueButton)
    await expect
      .element(screen.getByText(/^Ingresa tu correo\.$/i))
      .toBeInTheDocument()
  })

  it('sends a recovery email and navigates to sign-in on success', async () => {
    await userEvent.fill(emailInput, 'a@b.com')
    await userEvent.click(continueButton)

    await vi.waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledOnce())
    await vi.waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({ to: '/sign-in' })
    )

    await expect.element(emailInput).toHaveValue('')
  })
})
