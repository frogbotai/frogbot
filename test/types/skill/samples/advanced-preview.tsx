'use client';

import { RefreshRouteOnSave, useLivePreview } from '@frogbotai/live-preview-react';
import { useRouter } from 'next/navigation';

export function LivePreviewRefresh() {
  const router = useRouter();
  const serverURL = process.env.NEXT_PUBLIC_FROGBOT_URL;

  if (!serverURL) throw new Error('NEXT_PUBLIC_FROGBOT_URL is required');

  return <RefreshRouteOnSave refresh={() => router.refresh()} serverURL={serverURL} />;
}

export function PagePreview({ initialData }: { initialData: { title: string } }) {
  const serverURL = process.env.NEXT_PUBLIC_FROGBOT_URL;

  if (!serverURL) throw new Error('NEXT_PUBLIC_FROGBOT_URL is required');

  const { data } = useLivePreview({
    initialData,
    serverURL,
  });

  return <h1>{data.title}</h1>;
}
