import type { HTMLAttributes } from 'react';

import { useTheme } from '../theme/provider';

export interface CodeBlockProps extends HTMLAttributes<HTMLPreElement> {
  code: string;
  language?: string;
  role?: 'user' | 'assistant' | 'system';
}

export function CodeBlock({
  className,
  code,
  language,
  role = 'assistant',
  ...props
}: CodeBlockProps) {
  const { resolvedMode } = useTheme();
  const classes = [
    'fb-code-block',
    resolvedMode === 'dark' && role === 'user' ? 'fb-code-block--dark-user' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <pre className={classes} data-language={language} {...props}>
      <code>{code}</code>
    </pre>
  );
}
