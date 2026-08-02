import type { HTMLAttributes } from 'react'

import { cn } from '../lib/utils'
import { useTheme } from '../theme/provider'

export interface CodeBlockProps extends HTMLAttributes<HTMLPreElement> { code: string; language?: string; role?: 'user' | 'assistant' | 'system' }

export function CodeBlock({ className, code, language, role = 'assistant', ...props }: CodeBlockProps) {
  const { resolvedMode } = useTheme()
  return <pre className={cn('overflow-x-auto rounded-lg p-4 text-sm', resolvedMode === 'dark' && role === 'user' ? 'bg-muted-foreground' : 'bg-muted', className)} data-language={language} {...props}><code>{code}</code></pre>
}
