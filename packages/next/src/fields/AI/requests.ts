import { toast } from '@payloadcms/ui';
import { aiFieldPaths } from 'frogbot/fields';

import { appendQuery } from '../../views/cells.js';
import { aiRegenerateRequest } from './bulk.js';
import type { AIFieldDoc } from './poller.js';

export type RequestRegenerateArgs = {
  api: string;
  collectionSlug: string;
  draft: boolean;
  drafts: boolean;
  id: number | string;
  locale?: string;
  name: string;
};

type UpdateResponse = {
  doc?: AIFieldDoc;
  docs?: AIFieldDoc[];
  errors?: { message?: string }[];
  message?: string;
};

const RECORD_CHANGED = 'This record changed since it was loaded. Reload it and try again.';

function requestError(response: Response, result: UpdateResponse): Error {
  return new Error(
    result.errors?.[0]?.message ?? result.message ?? (response.statusText || 'Request failed'),
  );
}

async function patch(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  });

  const result = (await response.json().catch(() => ({}))) as UpdateResponse;

  return { response, result };
}

async function patchStatus({
  api,
  collectionSlug,
  id,
  locale,
  name,
}: RequestRegenerateArgs): Promise<AIFieldDoc> {
  const params = new URLSearchParams({ depth: '0' });

  appendQuery(params, 'locale', locale);

  const { response, result } = await patch(
    `${api}/${collectionSlug}/${encodeURIComponent(id)}?${params}`,
    { [aiFieldPaths(name).status]: 'pending' },
  );

  if (response.ok && result.doc) return result.doc;

  throw requestError(response, result);
}

async function patchVersion(args: RequestRegenerateArgs): Promise<AIFieldDoc> {
  const { body, url } = aiRegenerateRequest(args);
  const { response, result } = await patch(url, body);
  const [doc] = result.docs ?? [];

  if (response.ok && doc) return doc;

  if (response.ok && !result.errors?.length) throw new Error(RECORD_CHANGED);

  throw requestError(response, result);
}

export async function requestRegenerate(args: RequestRegenerateArgs): Promise<AIFieldDoc> {
  const request = args.drafts ? patchVersion(args) : patchStatus(args);

  return request.catch((error: unknown) => {
    toast.error(error instanceof Error ? error.message : String(error));

    throw error;
  });
}
