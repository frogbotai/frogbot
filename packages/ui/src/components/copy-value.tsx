'use client';

import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';

import CheckIcon from '../icons/icons/CheckIcon.js';
import CopyIcon from '../icons/icons/CopyIcon.js';
import { copyText } from '../lib/copy-text.js';

export type CopyValueProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Hide all but the last four characters, for keys and secrets. Values of 8 characters or fewer are hidden whole. */
  mask?: boolean;
  /** The text that is copied and shown. */
  value: string;
};

function masked(value: string): string {
  if (value.length <= 8) return '•'.repeat(8);

  return `${'•'.repeat(Math.min(Math.max(value.length - 4, 4), 12))}${value.slice(-4)}`;
}

/** An id, key or URL in monospace with a copy button. */
export function CopyValue({ className, mask, value, ...props }: CopyValueProps) {
  const [result, setResult] = useState<'copied' | 'failed'>();

  useEffect(() => {
    if (!result) return;

    const timer = setTimeout(() => setResult(undefined), 1500);

    return () => clearTimeout(timer);
  }, [result]);

  const copy = async () => setResult((await copyText(value)) ? 'copied' : 'failed');
  const copied = result === 'copied';
  const Icon = copied ? CheckIcon : CopyIcon;

  return (
    <div className={`fb-copy-value${className ? ` ${className}` : ''}`} {...props}>
      <code className="fb-copy-value__text" title={mask ? undefined : value}>
        {mask ? masked(value) : value}
      </code>
      <button
        aria-label={copied ? 'Copied' : result === 'failed' ? "Couldn't copy" : 'Copy'}
        className={`fb-copy-value__button${copied ? ' fb-copy-value__button--copied' : ''}`}
        onClick={copy}
        type="button"
      >
        <Icon aria-hidden size={14} />
      </button>
      <span aria-live="polite" className="fb-copy-value__status" role="status">
        {copied ? 'Copied' : result === 'failed' ? "Couldn't copy. Select the text instead." : ''}
      </span>
    </div>
  );
}
