'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className='flex min-h-[300px] items-center justify-center p-4'>
          <div className='text-center'>
            <AlertCircle className='mx-auto size-12 text-destructive' />
            <h2 className='mt-4 text-lg font-semibold'>Algo salió mal</h2>
            <p className='mt-2 text-sm text-muted-foreground'>
              {this.state.error?.message || 'Ha ocurrido un error inesperado'}
            </p>
            <Button className='mt-4' onClick={() => this.setState({ hasError: false, error: null })}>
              Reintentar
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}