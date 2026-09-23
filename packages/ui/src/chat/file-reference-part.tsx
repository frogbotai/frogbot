'use client';

import type { FrogBotSDK } from '@frogbotai/sdk';
import type { FileUIPart } from 'ai';
import { useEffect, useState } from 'react';

import { FilePart } from './file-part.js';
import { useChatProvider } from './provider.js';
import { chatRequest } from './rest.js';

type FileReferencePartProps = {
  id: string | number;
  filename?: string;
};

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
  assetsSlug,
  sdk,
}: FileReferencePartProps & { assetsSlug: string; sdk: FrogBotSDK }) {
  const [state, setState] = useState<{ sdk: FrogBotSDK; part?: FileUIPart; error?: boolean }>({
    sdk,
  });

  useEffect(() => {
    const controller = new AbortController();
    let objectURL: string | undefined;

    setState({ sdk });

    const load = async () => {
      const collectionPath = `/${encodeURIComponent(assetsSlug)}`;
      const asset = await chatRequest<{ filename: string; mimeType: string }>(
        sdk,
        `${collectionPath}/${encodeURIComponent(String(id))}?depth=0`,
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return;

      if (!asset.filename || !asset.mimeType) throw new Error('Attachment unavailable');

      const response = await sdk.request(
        `${collectionPath}/file/${encodeURIComponent(asset.filename)}`,
        { signal: controller.signal },
      );

      const blob = await response.blob();

      if (controller.signal.aborted) return;

      objectURL = URL.createObjectURL(blob);

      setState({
        sdk,
        part: {
          type: 'file',
          filename: asset.filename,
          mediaType: asset.mimeType,
          url: objectURL,
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

  if (state.sdk === sdk && state.part) return <FilePart part={state.part} />;

  return <AttachmentStatus filename={filename} loading={state.sdk !== sdk || !state.error} />;
}
