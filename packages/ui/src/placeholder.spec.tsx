import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Placeholder } from './placeholder'

describe('Placeholder', () => {
  it('renders', () => {
    render(<Placeholder />)

    expect(screen.getByText('FrogBot UI')).toBeTruthy()
  })
})
