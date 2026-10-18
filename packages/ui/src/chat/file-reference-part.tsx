'use client';

import type { FileUIPart } from 'ai';
import { useEffect, useState } from 'react';

import type { ChatPlatformAdapter } from './adapter.js';
import { AttachmentCard, isLargeFile, LargeFileHint } from './attachment-card.js';
import { HEAD_BYTES, kindFrom, typeLabel } from './attachment-kind.js';
import { FilePart } from './file-part.js';
import { useChatProvider } from './provider.js';

type FileReferencePartProps = {
  id: string | number;
  filename?: string;
  origin?: 'paste';
};

type LoadedAttachment = { size?: number } & (
  | { kind: 'text'; filename: string; mediaType: string; text: string }
  | { kind: 'file'; part: FileUIPart }
);

function AttachmentStatus({ filename, loading }: { filename?: string; loading: boolean }) {
  return (
    <div
      className="fb-file-part"
      data-part="file-reference"
      role={loading ? 'status' : 'alert'}
      aria-busy={loading}
    >
      {loading ? 'Loading attachment' : 'Attachment unavailable'}: {filename || 'Attachment'}
    </div>
  );
}

export function FileReferencePart(props: FileReferencePartProps) {
  const provider = useChatProvider();

  if (
    !provider?.manifest ||
    provider.error ||
    provider.loading ||
    !provider.adapter.readAttachment
  ) {
    return <AttachmentStatus filename={props.filename} loading={Boolean(provider?.loading)} />;
  }

  return <FileReferencePartInner key={String(props.id)} {...props} adapter={provider.adapter} />;
}

function FileReferencePartInner({
  id,
  filename,
  origin,
  adapter,
}: FileReferencePartProps & { adapter: ChatPlatformAdapter }) {
  const [state, setState] = useState<{
    adapter: ChatPlatformAdapter;
    attachment?: LoadedAttachment;
    error?: boolean;
  }>({ adapter });

  useEffect(() => {
    const controller = new AbortController();
    let objectURL: string | undefined;

    setState({ adapter });

    const load = async () => {
      const stored = await adapter.readAttachment?.(id, { signal: controller.signal });

      if (controller.signal.aborted) return;

      if (!stored) throw new Error('Attachment unavailable');

      const { filename: storedName, filesize: size, mediaType } = stored;

      if ('text' in stored) {
        setState({
          adapter,
          attachment: { kind: 'text', filename: storedName, mediaType, size, text: stored.text },
        });

        return;
      }

      const { blob } = stored;
      const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
      const kind = kindFrom({ mediaType, filename: storedName, head });

      if (kind === 'text') {
        const text = await blob.text();

        if (controller.signal.aborted) return;

        setState({
          adapter,
          attachment: { kind: 'text', filename: storedName, mediaType, size, text },
        });

        return;
      }

      if (controller.signal.aborted) return;

      objectURL = URL.createObjectURL(blob);

      setState({
        adapter,
        attachment: {
          kind: 'file',
          size,
          part: { type: 'file', filename: storedName, mediaType, url: objectURL },
        },
      });
    };

    void load().catch(() => {
      if (!controller.signal.aborted) setState({ adapter, error: true });
    });

    return () => {
      controller.abort();

      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [adapter, id]);

  const attachment = state.adapter === adapter ? state.attachment : undefined;

  if (attachment?.kind === 'text') {
    const name = filename || attachment.filename;

    return (
      <AttachmentCard
        name={name}
        state="text"
        typeLabel={typeLabel({ filename: name, mediaType: attachment.mediaType, origin })}
        text={attachment.text}
        size={attachment.size}
      />
    );
  }

  if (attachment?.kind === 'file') {
    const part = { ...attachment.part, filename: filename || attachment.part.filename };

    if (!isLargeFile(attachment.size)) return <FilePart part={part} />;

    return (
      <div className="fb-file-reference">
        <FilePart part={part} />
        <LargeFileHint size={attachment.size} />
      </div>
    );
  }

  return (
    <AttachmentStatus filename={filename} loading={state.adapter !== adapter || !state.error} />
  );
}
