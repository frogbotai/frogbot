import { Fragment } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

import { CodeBlock } from './code-block'

type MessageRole = 'user' | 'assistant' | 'system'

export interface MarkdownProps {
  children: string
  role?: MessageRole
}

function safeUrl(url: string) {
  return /^(https?:|mailto:|\/|#)/i.test(url)
}

const createComponents = (role: MessageRole): Components => ({
  p: ({ node: _, ...props }) => <p className="break-words text-base" {...props} />,
  code: ({ children, className, node: _, ...props }) => {
    const value = String(children)
    const code = value.replace(/\n$/, '')
    if (!value.includes('\n')) return <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm" {...props}>{code}</code>
    const language = className?.match(/language-(\w+)/)?.[1]
    return <CodeBlock code={code} language={language} role={role} />
  },
  pre: ({ children }) => <>{children}</>,
  hr: ({ node: _, ...props }) => <hr className="border-base-200 my-4 w-full" {...props} />,
  ol: ({ node: _, ...props }) => <ol className="ml-4 list-outside list-decimal text-base" {...props} />,
  li: ({ node: _, ...props }) => <li className="text-base" {...props} />,
  ul: ({ node: _, ...props }) => <ul className="ml-4 list-outside list-disc text-base" {...props} />,
  strong: ({ node: _, ...props }) => <strong className="font-semibold" {...props} />,
  em: ({ node: _, ...props }) => <span className="italic" {...props} />,
  blockquote: ({ node: _, ...props }) => <blockquote className="border-brand-400 mx-0 border-0 border-l-[2px] border-solid pl-4 italic" {...props} />,
  del: ({ node: _, ...props }) => <span className="line-through" {...props} />,
  a: ({ children, href, node: _, ...props }) => {
    if (!href || !safeUrl(href)) return <Fragment>{children}</Fragment>
    return <a className="break-all text-blue-600 hover:underline" href={href} rel="noreferrer" target={href.startsWith('http') ? '_blank' : undefined} {...props}>{children}</a>
  },
  h1: ({ node: _, ...props }) => <h1 className="break-words text-3xl font-semibold" {...props} />,
  h2: ({ node: _, ...props }) => <h2 className="break-words text-2xl font-semibold" {...props} />,
  h3: ({ node: _, ...props }) => <h3 className="break-words text-xl font-semibold" {...props} />,
  h4: ({ node: _, ...props }) => <h4 className="break-words text-lg font-semibold" {...props} />,
  h5: ({ node: _, ...props }) => <h5 className="break-words text-base font-semibold" {...props} />,
  h6: ({ node: _, ...props }) => <h6 className="break-words text-sm font-semibold" {...props} />,
  table: ({ children, node: _, ...props }) => <div className="border-base-300 my-4 overflow-hidden overflow-x-auto rounded-md border border-solid"><table className="min-w-full border-collapse" {...props}>{children}</table></div>,
  thead: ({ node: _, ...props }) => <thead className="bg-base-200" {...props} />,
  tbody: ({ node: _, ...props }) => <tbody {...props} />,
  tr: ({ node: _, ...props }) => <tr className="border-base-300 border-b border-solid last:border-b-0" {...props} />,
  th: ({ node: _, ...props }) => <th className="border-base-300 border-r border-solid px-4 py-2 text-left font-semibold last:border-r-0" {...props} />,
  td: ({ node: _, ...props }) => <td className="border-base-300 border-r border-solid px-4 py-2 last:border-r-0" {...props} />,
})

export function Markdown({ children, role = 'assistant' }: MarkdownProps) {
  return <ReactMarkdown components={createComponents(role)} remarkPlugins={[remarkGfm, remarkBreaks]} urlTransform={(url) => url}>{children}</ReactMarkdown>
}
