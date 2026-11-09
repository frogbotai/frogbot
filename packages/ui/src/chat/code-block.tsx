'use client';

import type { CSSProperties, HTMLAttributes } from 'react';
import { Fragment, useEffect, useRef, useState } from 'react';

import { Tooltip } from '../components/tooltip.js';
import CheckIcon from '../icons/icons/CheckIcon.js';
import CopyIcon from '../icons/icons/CopyIcon.js';
import { copyText } from '../lib/copy-text.js';
import type { HighlightedLine } from './highlight.js';

/** Props for {@link CodeBlock}. */
export interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  /** The raw code. The copy button puts exactly this on the clipboard. */
  code: string;
  /** The fence's language, such as `ts`. Unknown or missing languages render as plain text. */
  language?: string;
  role?: 'user' | 'assistant' | 'system';
}

interface Highlighted {
  code: string;
  language: string;
  lines: HighlightedLine[];
}

const COPIED_MS = 1500;
const HIGHLIGHT_MS = 150;

const ITALIC = 1;
const BOLD = 2;
const UNDERLINE = 4;
const STRIKETHROUGH = 8;

function useThrottled<T>(value: T, ms: number) {
  const [throttled, setThrottled] = useState(value);
  const last = useRef(0);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        last.current = Date.now();
        setThrottled(value);
      },
      Math.max(0, last.current + ms - Date.now()),
    );

    return () => clearTimeout(timer);
  }, [value, ms]);

  return throttled;
}

function tokenStyle(color: string | undefined, fontStyle = 0): CSSProperties {
  const lines = [fontStyle & UNDERLINE && 'underline', fontStyle & STRIKETHROUGH && 'line-through'];

  return {
    color,
    fontStyle: fontStyle & ITALIC ? 'italic' : undefined,
    fontWeight: fontStyle & BOLD ? 'bold' : undefined,
    textDecoration: lines.filter(Boolean).join(' ') || undefined,
  };
}

function HighlightedCode({ lines }: { lines: HighlightedLine[] }) {
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? '\n' : null}
      {line.map((token, tokenIndex) => (
        <span key={tokenIndex} style={tokenStyle(token.color, token.fontStyle)}>
          {token.content}
        </span>
      ))}
    </Fragment>
  ));
}

function useHighlighted(code: string, language: string | undefined) {
  const source = useThrottled(code, HIGHLIGHT_MS);
  const [highlighted, setHighlighted] = useState<Highlighted>();

  useEffect(() => {
    if (!language) return;

    let current = true;

    void import('./highlight.js')
      .then(({ highlight }) => highlight(source, language))
      .then((lines) => {
        if (current) setHighlighted(lines ? { code: source, language, lines } : undefined);
      });

    return () => {
      current = false;
    };
  }, [language, source]);

  if (!highlighted || highlighted.language !== language) return undefined;
  if (!code.startsWith(highlighted.code)) return undefined;

  return { lines: highlighted.lines, tail: code.slice(highlighted.code.length) };
}

/**
 * A fenced code block: its language, a copy button and the code, highlighted
 * once its grammar loads. While a reply streams, the new text shows plain until it is highlighted.
 */
export function CodeBlock({
  className,
  code,
  language,
  role = 'assistant',
  ...props
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const highlighted = useHighlighted(code, language);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    if (!(await copyText(code))) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    setCopied(true);
  };

  const classes = ['fb-code-block', role === 'user' ? 'fb-code-block--user' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} data-language={language} {...props}>
      {language ? <div className="fb-code-block__language">{language}</div> : null}
      <Tooltip label={copied ? 'Copied' : 'Copy code'} side="top">
        <button
          aria-label="Copy code"
          className="fb-code-block__copy"
          data-copied={copied || undefined}
          onClick={copy}
          type="button"
        >
          {copied ? (
            <CheckIcon aria-hidden="true" className="fb-code-block__icon" />
          ) : (
            <CopyIcon aria-hidden="true" className="fb-code-block__icon" />
          )}
        </button>
      </Tooltip>
      <span className="fb-code-block__status" role="status">
        {copied ? 'Copied' : ''}
      </span>
      <pre className="fb-code-block__code">
        <code>
          {highlighted ? (
            <>
              <HighlightedCode lines={highlighted.lines} />
              {highlighted.tail}
            </>
          ) : (
            code
          )}
        </code>
      </pre>
    </div>
  );
}
