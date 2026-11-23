import type { HTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export type ReportViewProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Markdown the app wrote: headings, lists, tables, links and code. Images the app serves itself (a path such as `/api/media/file/chart.png`) show inline; images from other sites show as links, so opening a report never contacts them. */
  children: string;
};

const remarkPlugins = [remarkGfm];

const EXTERNAL = /^(https?:)?\/\//i;

/** Markdown the app generated (a report, digest or AI summary), rendered as a readable document. */
export function ReportView({ children, className, ...props }: ReportViewProps) {
  return (
    <div className={`fb-report${className ? ` ${className}` : ''}`} {...props}>
      <ReactMarkdown
        components={{
          a: ({ children: text, node: _, ...link }) => (
            <a className="fb-report__link" {...link}>
              {text}
            </a>
          ),
          img: ({ alt, node: _, src }) =>
            typeof src === 'string' && EXTERNAL.test(src) ? (
              <a className="fb-report__link" href={src} rel="noreferrer" target="_blank">
                {alt || 'Image'}
              </a>
            ) : (
              <img alt={alt ?? ''} className="fb-report__image" loading="lazy" src={src} />
            ),
          table: ({ node: _, ...table }) => (
            <div className="fb-report__table-wrap">
              <table {...table} />
            </div>
          ),
        }}
        remarkPlugins={remarkPlugins}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
