import { Fragment } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { CodeBlock } from './code-block.js';

type MessageRole = 'user' | 'assistant' | 'system';

export interface MarkdownProps {
  children: string;
  role?: MessageRole;
}

function safeUrl(url: string) {
  return /^(https?:|mailto:|\/|#)/i.test(url);
}

const createComponents = (role: MessageRole): Components => ({
  p: ({ node: _, ...props }) => <p className="fb-markdown__paragraph" {...props} />,
  code: ({ children, className, node: _, ...props }) => {
    const value = String(children);
    const code = value.replace(/\n$/, '');
    if (!value.includes('\n')) {
      return (
        <code className="fb-markdown__inline-code" {...props}>
          {code}
        </code>
      );
    }
    const language = className?.match(/language-(\w+)/)?.[1];
    return <CodeBlock code={code} language={language} role={role} />;
  },
  pre: ({ children }) => <>{children}</>,
  hr: ({ node: _, ...props }) => <hr className="fb-markdown__rule" {...props} />,
  ol: ({ node: _, ...props }) => <ol className="fb-markdown__ordered-list" {...props} />,
  li: ({ node: _, ...props }) => <li className="fb-markdown__list-item" {...props} />,
  ul: ({ node: _, ...props }) => <ul className="fb-markdown__unordered-list" {...props} />,
  strong: ({ node: _, ...props }) => <strong className="fb-markdown__strong" {...props} />,
  em: ({ node: _, ...props }) => <span className="fb-markdown__emphasis" {...props} />,
  blockquote: ({ node: _, ...props }) => (
    <blockquote className="fb-markdown__blockquote" {...props} />
  ),
  del: ({ node: _, ...props }) => <span className="fb-markdown__strikethrough" {...props} />,
  a: ({ children, href, node: _, ...props }) => {
    if (!href || !safeUrl(href)) return <Fragment>{children}</Fragment>;
    return (
      <a
        className="fb-markdown__link"
        href={href}
        rel="noreferrer"
        target={href.startsWith('http') ? '_blank' : undefined}
        {...props}
      >
        {children}
      </a>
    );
  },
  h1: ({ node: _, ...props }) => <h1 className="fb-markdown__heading-1" {...props} />,
  h2: ({ node: _, ...props }) => <h2 className="fb-markdown__heading-2" {...props} />,
  h3: ({ node: _, ...props }) => <h3 className="fb-markdown__heading-3" {...props} />,
  h4: ({ node: _, ...props }) => <h4 className="fb-markdown__heading-4" {...props} />,
  h5: ({ node: _, ...props }) => <h5 className="fb-markdown__heading-5" {...props} />,
  h6: ({ node: _, ...props }) => <h6 className="fb-markdown__heading-6" {...props} />,
  table: ({ children, node: _, ...props }) => (
    <div className="fb-markdown__table-container">
      <table className="fb-markdown__table" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ node: _, ...props }) => <thead className="fb-markdown__table-head" {...props} />,
  tbody: ({ node: _, ...props }) => <tbody {...props} />,
  tr: ({ node: _, ...props }) => <tr className="fb-markdown__table-row" {...props} />,
  th: ({ node: _, ...props }) => <th className="fb-markdown__table-header" {...props} />,
  td: ({ node: _, ...props }) => <td className="fb-markdown__table-cell" {...props} />,
});

export function Markdown({ children, role = 'assistant' }: MarkdownProps) {
  return (
    <ReactMarkdown
      components={createComponents(role)}
      remarkPlugins={[remarkGfm, remarkBreaks]}
      urlTransform={(url) => url}
    >
      {children}
    </ReactMarkdown>
  );
}
