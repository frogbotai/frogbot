'use client';

import { useLivePreview } from '@frogbotai/live-preview-react';

import type { Page } from '../../../../frogbot-types';
import { pageTitleId, serverURL } from '../../../../shared';

export function PageClient({ page }: { page: Page }) {
  const { data } = useLivePreview<Page>({ initialData: page, serverURL, depth: 0 });

  return <h1 id={pageTitleId}>{data.title}</h1>;
}
