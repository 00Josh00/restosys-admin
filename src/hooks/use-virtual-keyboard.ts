import { useEffect, useState } from 'react'

export function useVirtualKeyboard() {
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)

  useEffect(() => {
    if (!('visualViewport' in window)) return

    const viewport = window.visualViewport!

    const handleResize = () => {
      const height = window.innerHeight - viewport.height
      setKeyboardHeight(height)
      setIsKeyboardOpen(height > 150)
    }

    viewport.addEventListener('resize', handleResize)
    viewport.addEventListener('scroll', handleResize)

    handleResize()

    return () => {
      viewport.removeEventListener('resize', handleResize)
      viewport.removeEventListener('scroll', handleResize)
    }
  }, [])

  return { keyboardHeight, isKeyboardOpen }
}

export function useDialogKeyboardAdjust() {
  const { isKeyboardOpen, keyboardHeight } = useVirtualKeyboard()

  useEffect(() => {
    if (isKeyboardOpen) {
      document.body.style.paddingBottom = `${keyboardHeight}px`
      document.body.classList.add('keyboard-open')
    } else {
      document.body.style.paddingBottom = ''
      document.body.classList.remove('keyboard-open')
    }

    return () => {
      document.body.style.paddingBottom = ''
      document.body.classList.remove('keyboard-open')
    }
  }, [isKeyboardOpen, keyboardHeight])
}
