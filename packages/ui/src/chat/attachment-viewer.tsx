'use client';

import { type ReactElement, useState } from 'react';

import { Button } from '../components/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/dialog.js';
import CopyIcon from '../icons/icons/CopyIcon.js';

export type AttachmentViewerProps = {
  children: ReactElement;
  name: string;
  text: string;
};

export function AttachmentViewer({ children, name, text }: AttachmentViewerProps) {
  const [status, setStatus] = useState('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);

      setStatus('Copied');
    } catch {
      setStatus("Couldn't copy");
    }
  };

  return (
    <Dialog onOpenChange={() => setStatus('')}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="fb-attachment-viewer"
        withCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="fb-attachment-viewer__title">{name}</DialogTitle>
        </DialogHeader>
        <pre className="fb-attachment-viewer__text" tabIndex={0}>
          {text}
        </pre>
        <DialogFooter>
          <span role="status" className="fb-attachment-viewer__status">
            {status}
          </span>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button onClick={() => void copy()}>
            <CopyIcon className="fb-attachment-viewer__copy-icon" />
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
