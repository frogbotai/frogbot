'use client';

import { useLivePreview } from '@frogbotai/live-preview-react';

import type { Page } from '../../../../frogbot-types';
import { pageTitleId } from '../../../../shared';

export function PageClient({ page, serverURL }: { page: Page; serverURL: string }) {
  const { data } = useLivePreview<Page>({ initialData: page, serverURL, depth: 0 });

  return <h1 id={pageTitleId}>{data.title}</h1>;
}
