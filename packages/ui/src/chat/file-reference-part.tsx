'use client';

import type { FrogBotSDK } from '@frogbotai/sdk';
import type { FileUIPart } from 'ai';
import { useEffect, useState } from 'react';

import { AttachmentCard, isLargeFile, LargeFileHint } from './attachment-card.js';
import { HEAD_BYTES, kindFrom, typeLabel } from './attachment-kind.js';
import { FilePart } from './file-part.js';
import { useChatProvider } from './provider.js';
import { chatRequest } from './rest.js';

type FileReferencePartProps = {
  id: string | number;
  filename?: string;
  origin?: 'paste';
};

type LoadedAttachment = { size?: number } & (
  { kind: 'text'; filename: string; text: string } | { kind: 'file'; part: FileUIPart }
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

  if (!provider?.manifest?.chat.enabled || provider.error || provider.loading) {
    return <AttachmentStatus filename={props.filename} loading={Boolean(provider?.loading)} />;
  }

  const { assetsSlug } = provider.manifest.chat;

  return (
    <FileReferencePartInner
      key={JSON.stringify([assetsSlug, props.id])}
      {...props}
      assetsSlug={assetsSlug}
      sdk={provider.sdk}
    />
  );
}

function FileReferencePartInner({
  id,
  filename,
  origin,
  assetsSlug,
  sdk,
}: FileReferencePartProps & { assetsSlug: string; sdk: FrogBotSDK }) {
  const [state, setState] = useState<{
    sdk: FrogBotSDK;
    attachment?: LoadedAttachment;
    error?: boolean;
  }>({ sdk });

  useEffect(() => {
    const controller = new AbortController();
    let objectURL: string | undefined;

    setState({ sdk });

    const load = async () => {
      const collectionPath = `/${encodeURIComponent(assetsSlug)}`;
      const asset = await chatRequest<{
        filename: string;
        mimeType: string;
        filesize?: number | null;
      }>(sdk, `${collectionPath}/${encodeURIComponent(String(id))}?depth=0`, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!asset.filename || !asset.mimeType) throw new Error('Attachment unavailable');

      const response = await sdk.request(
        `${collectionPath}/file/${encodeURIComponent(asset.filename)}`,
        { signal: controller.signal },
      );

      const blob = await response.blob();
      const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
      const kind = kindFrom({ mediaType: asset.mimeType, filename: asset.filename, head });
      const size = asset.filesize ?? undefined;

      if (kind === 'text') {
        const text = await blob.text();

        if (controller.signal.aborted) return;

        setState({
          sdk,
          attachment: { kind: 'text', filename: asset.filename, size, text },
        });

        return;
      }

      if (controller.signal.aborted) return;

      objectURL = URL.createObjectURL(blob);

      setState({
        sdk,
        attachment: {
          kind: 'file',
          size,
          part: {
            type: 'file',
            filename: asset.filename,
            mediaType: asset.mimeType,
            url: objectURL,
          },
        },
      });
    };

    void load().catch(() => {
      if (!controller.signal.aborted) setState({ sdk, error: true });
    });

    return () => {
      controller.abort();

      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [assetsSlug, id, sdk]);

  const attachment = state.sdk === sdk ? state.attachment : undefined;

  if (attachment?.kind === 'text') {
    const name = filename || attachment.filename;

    return (
      <AttachmentCard
        name={name}
        state="text"
        typeLabel={typeLabel({ filename: name, origin })}
        text={attachment.text}
        size={attachment.size}
      />
    );
  }

  if (attachment?.kind === 'file') {
    if (!isLargeFile(attachment.size)) return <FilePart part={attachment.part} />;

    return (
      <div className="fb-file-reference">
        <FilePart part={attachment.part} />
        <LargeFileHint size={attachment.size} />
      </div>
    );
  }

  return <AttachmentStatus filename={filename} loading={state.sdk !== sdk || !state.error} />;
}
