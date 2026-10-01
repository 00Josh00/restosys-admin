import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { type Locator, userEvent } from 'vitest/browser'
import { SignUpForm } from './sign-up-form'

const FORM_MESSAGES = {
  emailEmpty: 'Ingresa tu correo.',
  passwordEmpty: 'Ingresa tu contraseña.',
  confirmPasswordEmpty: 'Confirma tu contraseña.',
  passwordMismatch: 'Las contraseñas no coinciden.',
} as const

const navigateMock = vi.fn()
const signUp = vi.fn()

vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: (payload: unknown) => signUp(payload),
    },
  },
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

describe('SignUpForm', () => {
  let screen: RenderResult
  let emailInput: Locator
  let passwordInput: Locator
  let confirmPasswordInput: Locator
  let submitButton: Locator

  beforeEach(async () => {
    vi.clearAllMocks()
    signUp.mockResolvedValue({ data: { session: null }, error: null })

    screen = await render(<SignUpForm />)
    emailInput = screen.getByRole('textbox', { name: /^Correo$/i })
    passwordInput = screen.getByLabelText(/^Contraseña$/i)
    confirmPasswordInput = screen.getByLabelText(/^Confirmar contraseña$/i)
    submitButton = screen.getByRole('button', { name: /^Crear cuenta$/i })
  })

  it('renders fields and submit button', async () => {
    await expect.element(emailInput).toBeInTheDocument()
    await expect.element(passwordInput).toBeInTheDocument()
    await expect.element(confirmPasswordInput).toBeInTheDocument()
    await expect.element(submitButton).toBeInTheDocument()
  })

  it('shows validation messages when submitting empty form', async () => {
    await userEvent.click(submitButton)

    await expect
      .element(screen.getByText(FORM_MESSAGES.emailEmpty))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText(FORM_MESSAGES.passwordEmpty))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText(FORM_MESSAGES.confirmPasswordEmpty))
      .toBeInTheDocument()
  })

  it('shows a mismatch error when passwords do not match', async () => {
    await userEvent.fill(emailInput, 'a@b.com')
    await userEvent.fill(passwordInput, '1234567')
    await userEvent.fill(confirmPasswordInput, '7654321')

    await userEvent.click(submitButton)
    await expect
      .element(screen.getByText(FORM_MESSAGES.passwordMismatch))
      .toBeInTheDocument()
  })

  it('creates an account and navigates to sign-in when confirmation is required', async () => {
    await userEvent.fill(emailInput, 'a@b.com')
    await userEvent.fill(passwordInput, '1234567')
    await userEvent.fill(confirmPasswordInput, '1234567')

    await userEvent.click(submitButton)

    await vi.waitFor(() => expect(signUp).toHaveBeenCalledOnce())
    await vi.waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({ to: '/sign-in', replace: true })
    )
  })
})
