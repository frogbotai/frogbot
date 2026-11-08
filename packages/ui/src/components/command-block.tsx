'use client';

import type { HTMLAttributes } from 'react';
import { useEffect, useId, useState } from 'react';

import CheckIcon from '../icons/icons/CheckIcon.js';
import CopyIcon from '../icons/icons/CopyIcon.js';
import { copyText } from '../lib/copy-text.js';
import { Tooltip } from './tooltip.js';

/** Props for {@link CommandBlock}. */
export interface CommandBlockProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onCopy'> {
  /** The exact text the copy button puts on the clipboard. Line breaks are kept. */
  code: string;
  /** A short caption above the box, such as the shell or file it belongs in. */
  label?: string;
  /** Called after a copy succeeds, for example to show a toast. */
  onCopy?: () => void;
}

const COPIED_MS = 1500;

/** A monospace box holding one command or snippet, with a button that copies it exactly. */
export function CommandBlock({ className, code, label, onCopy, ...props }: CommandBlockProps) {
  const [copied, setCopied] = useState(false);
  const labelId = useId();

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);

    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    if (!(await copyText(code))) return;
    setCopied(true);
    onCopy?.();
  };

  const action = copied ? 'Copied' : 'Copy';

  return (
    <div className={`fb-command-block${className ? ` ${className}` : ''}`} {...props}>
      {label ? (
        <div className="fb-command-block__label" id={labelId}>
          {label}
        </div>
      ) : null}
      <div className="fb-command-block__box">
        <pre aria-labelledby={label ? labelId : undefined} className="fb-command-block__code">
          <code>{code}</code>
        </pre>
        <Tooltip label={action} side="top">
          <button
            aria-label={label ? `${action} ${label}` : action}
            className="fb-command-block__copy"
            data-copied={copied || undefined}
            onClick={copy}
            type="button"
          >
            {copied ? (
              <CheckIcon aria-hidden="true" className="fb-command-block__icon" />
            ) : (
              <CopyIcon aria-hidden="true" className="fb-command-block__icon" />
            )}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
