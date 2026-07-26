import type { HTMLAttributes } from 'react'

import { cn } from '../lib/utils'

export interface CodeBlockProps extends HTMLAttributes<HTMLPreElement> { code: string; language?: string }

export function CodeBlock({ className, code, language, ...props }: CodeBlockProps) {
  return <pre className={cn('overflow-x-auto rounded-lg bg-muted p-4 text-sm', className)} data-language={language} {...props}><code>{code}</code></pre>
}
