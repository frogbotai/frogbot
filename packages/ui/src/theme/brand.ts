import type { ReactNode } from 'react'

import type { ThemeTokens } from './provider'

export interface BrandConfig {
  icon: ReactNode
  logo: ReactNode
  productName: string
  tokens?: ThemeTokens
}

export type BrandTheme = Pick<BrandConfig, 'tokens'>
