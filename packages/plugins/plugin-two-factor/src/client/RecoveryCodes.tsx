'use client';

import { Button } from '@frogbotai/ui';
import { CopyIcon, DownloadIcon } from '@frogbotai/ui/icons';
import { useState } from 'react';

/** Ten one-time recovery codes, shown once, with copy and download as a `.txt` file. */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = `${codes.join('\n')}\n`;

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');

    link.href = url;
    link.download = `${window.location.hostname}-recovery-codes.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="two-factor__recovery">
      <ol aria-label="Recovery codes" className="two-factor__codes">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ol>
      <div className="two-factor__row">
        <Button onClick={copy} size="sm" type="button" variant="secondary">
          <CopyIcon />
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button onClick={download} size="sm" type="button" variant="secondary">
          <DownloadIcon />
          Download
        </Button>
      </div>
    </div>
  );
}
