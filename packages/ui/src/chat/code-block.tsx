import type { HTMLAttributes } from 'react';

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
  const classes = ['fb-code-block', role === 'user' ? 'fb-code-block--user' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <pre className={classes} data-language={language} {...props}>
      <code>{code}</code>
    </pre>
  );
}
