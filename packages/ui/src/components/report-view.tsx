import type { HTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export type ReportViewProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Markdown the app wrote: headings, lists, tables, links and code. */
  children: string;
};

const remarkPlugins = [remarkGfm];

/** Markdown the app generated (a report, digest or AI summary), rendered as a readable document. */
export function ReportView({ children, className, ...props }: ReportViewProps) {
  return (
    <div className={`fb-report${className ? ` ${className}` : ''}`} {...props}>
      <ReactMarkdown
        components={{
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
