'use client';

import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';

import CheckIcon from '../icons/icons/CheckIcon.js';
import CopyIcon from '../icons/icons/CopyIcon.js';
import { copyText } from '../lib/copy-text.js';

export type CopyValueProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Hide all but the last four characters, for keys and secrets. */
  mask?: boolean;
  /** The text that is copied and shown. */
  value: string;
};

function masked(value: string): string {
  return `${'•'.repeat(Math.min(Math.max(value.length - 4, 4), 12))}${value.slice(-4)}`;
}

/** An id, key or URL in monospace with a copy button. */
export function CopyValue({ className, mask, value, ...props }: CopyValueProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => setCopied(false), 1500);

    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => setCopied(await copyText(value));
  const Icon = copied ? CheckIcon : CopyIcon;

  return (
    <div className={`fb-copy-value${className ? ` ${className}` : ''}`} {...props}>
      <code className="fb-copy-value__text" title={mask ? undefined : value}>
        {mask ? masked(value) : value}
      </code>
      <button
        aria-label={copied ? 'Copied' : 'Copy'}
        className={`fb-copy-value__button${copied ? ' fb-copy-value__button--copied' : ''}`}
        onClick={copy}
        type="button"
      >
        <Icon aria-hidden size={14} />
      </button>
    </div>
  );
}
