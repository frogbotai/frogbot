import { toast } from '@payloadcms/ui';

import { appendQuery } from '../../views/cells.js';
import type { AIFieldDoc } from './poller.js';

export type RequestRegenerateArgs = {
  api: string;
  collectionSlug: string;
  draft: boolean;
  id: number | string;
  locale?: string;
  statusPath: string;
};

type UpdateResponse = {
  doc?: AIFieldDoc;
  errors?: { message?: string }[];
  message?: string;
};

async function patchStatus({
  api,
  collectionSlug,
  draft,
  id,
  locale,
  statusPath,
}: RequestRegenerateArgs): Promise<AIFieldDoc> {
  const params = new URLSearchParams({ depth: '0' });

  appendQuery(params, 'locale', locale);

  if (draft) params.set('draft', 'true');

  const response = await fetch(`${api}/${collectionSlug}/${encodeURIComponent(id)}?${params}`, {
    body: JSON.stringify({ [statusPath]: 'pending' }),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  });

  const result = (await response.json().catch(() => ({}))) as UpdateResponse;

  if (response.ok && result.doc) return result.doc;

  throw new Error(
    result.errors?.[0]?.message ?? result.message ?? (response.statusText || 'Request failed'),
  );
}

export async function requestRegenerate(args: RequestRegenerateArgs): Promise<AIFieldDoc> {
  return patchStatus(args).catch((error: unknown) => {
    toast.error(error instanceof Error ? error.message : String(error));

    throw error;
  });
}
