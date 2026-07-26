import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

Object.defineProperty(Element.prototype, 'hasPointerCapture', { value: () => false })
Object.defineProperty(Element.prototype, 'releasePointerCapture', { value: () => undefined })
Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => undefined })
Object.defineProperty(Element.prototype, 'setPointerCapture', { value: () => undefined })
globalThis.ResizeObserver = class { disconnect() {}; observe() {}; unobserve() {} }

afterEach(cleanup)
