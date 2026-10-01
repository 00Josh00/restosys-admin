import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { type Locator, userEvent } from 'vitest/browser'
import { UserAuthForm } from './user-auth-form'

const FORM_MESSAGES = {
  emailEmpty: 'Ingresa tu correo.',
  passwordEmpty: 'Ingresa tu contraseña.',
  passwordShort: 'La contraseña debe tener al menos 6 caracteres.',
} as const

const navigate = vi.fn()
const setUserMock = vi.fn()
const signInMock = vi.fn()

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    auth: {
      setUser: setUserMock,
    },
  }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (credentials: unknown) => signInMock(credentials),
    },
  },
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigate,
    Link: ({
      children,
      to,
      className,
      ...rest
    }: {
      children?: React.ReactNode
      to: string
      className?: string
    }) => (
      <a href={to} className={className} {...rest}>
        {children}
      </a>
    ),
  }
})

describe('UserAuthForm', () => {
  describe('Rendering without redirectTo', () => {
    let screen: RenderResult
    let emailInput: Locator
    let passwordInput: Locator
    let signInButton: Locator
    let forgotPasswordLink: Locator

    beforeEach(async () => {
      vi.clearAllMocks()
      signInMock.mockResolvedValue({
        data: { user: { email: 'a@b.com' } },
        error: null,
      })
      screen = await render(<UserAuthForm />)
      emailInput = screen.getByRole('textbox', { name: /^Correo$/i })
      passwordInput = screen.getByLabelText(/^Contraseña$/i)
      signInButton = screen.getByRole('button', { name: /^Ingresar$/i })
      forgotPasswordLink = screen.getByText(/^¿Olvidaste tu contraseña\?$/i)
    })

    it('renders fields, submit button, and forgot password link', async () => {
      await expect.element(emailInput).toBeInTheDocument()
      await expect.element(passwordInput).toBeInTheDocument()
      await expect.element(signInButton).toBeInTheDocument()
      await expect.element(forgotPasswordLink).toBeInTheDocument()
    })

    it('shows validation messages when submitting empty form', async () => {
      await userEvent.click(signInButton)

      await expect
        .element(screen.getByText(FORM_MESSAGES.emailEmpty))
        .toBeInTheDocument()
      await expect
        .element(screen.getByText(FORM_MESSAGES.passwordEmpty))
        .toBeInTheDocument()
    })

    it('authenticates and navigates to default route on success', async () => {
      await userEvent.fill(emailInput, 'a@b.com')
      await userEvent.fill(passwordInput, '1234567')

      await userEvent.click(signInButton)

      await vi.waitFor(() => expect(signInMock).toHaveBeenCalledOnce())
      expect(signInMock).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: '1234567',
      })
      await vi.waitFor(() => expect(setUserMock).toHaveBeenCalledOnce())

      await vi.waitFor(() =>
        expect(navigate).toHaveBeenCalledWith({ to: '/', replace: true })
      )
    })
  })

  it('navigates to redirectTo when provided', async () => {
    vi.clearAllMocks()
    signInMock.mockResolvedValue({
      data: { user: { email: 'a@b.com' } },
      error: null,
    })

    const { getByRole, getByLabelText } = await render(
      <UserAuthForm redirectTo='/settings' />
    )

    await userEvent.fill(getByRole('textbox', { name: /Correo/i }), 'a@b.com')
    await userEvent.fill(getByLabelText('Contraseña'), '1234567')

    await userEvent.click(getByRole('button', { name: /Ingresar/i }))

    await vi.waitFor(() => expect(setUserMock).toHaveBeenCalledOnce())

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/settings',
        replace: true,
      })
    )
  })
})
