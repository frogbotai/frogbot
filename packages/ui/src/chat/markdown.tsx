import { Fragment, memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { CodeBlock } from './code-block.js';
import { markdownBlocks } from './markdown-blocks.js';

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
  h1: ({ children, node: _, ...props }) => (
    <h1 className="fb-markdown__heading-1" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, node: _, ...props }) => (
    <h2 className="fb-markdown__heading-2" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, node: _, ...props }) => (
    <h3 className="fb-markdown__heading-3" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, node: _, ...props }) => (
    <h4 className="fb-markdown__heading-4" {...props}>
      {children}
    </h4>
  ),
  h5: ({ children, node: _, ...props }) => (
    <h5 className="fb-markdown__heading-5" {...props}>
      {children}
    </h5>
  ),
  h6: ({ children, node: _, ...props }) => (
    <h6 className="fb-markdown__heading-6" {...props}>
      {children}
    </h6>
  ),
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

const components: Record<MessageRole, Components> = {
  assistant: createComponents('assistant'),
  system: createComponents('system'),
  user: createComponents('user'),
};

const remarkPlugins = [remarkGfm, remarkBreaks];

const keepUrl = (url: string) => url;

const MarkdownBlock = memo(function MarkdownBlock({
  children,
  role,
}: {
  children: string;
  role: MessageRole;
}) {
  return (
    <ReactMarkdown
      components={components[role]}
      remarkPlugins={remarkPlugins}
      urlTransform={keepUrl}
    >
      {children}
    </ReactMarkdown>
  );
});

export function Markdown({ children, role = 'assistant' }: MarkdownProps) {
  const blocks = useMemo(() => markdownBlocks(children), [children]);

  return blocks.map((block, index) => (
    <MarkdownBlock key={index} role={role}>
      {block}
    </MarkdownBlock>
  ));
}
