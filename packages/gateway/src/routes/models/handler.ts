// GET /v1/models — OpenAI-compatible model discovery endpoint.
//
// Serializes the configured model catalog as an OpenAI-shaped list
// (`{ object: 'list', data: [{ id, object, created, owned_by }] }`),
// filtered to entries servable by at least one configured provider.
//
// The catalog is discovery-only: unlisted models still route normally if
// the provider supports them.

import { Hono } from 'hono';

import { toOpenAIErrorResponse, toContentfulStatus } from '../../errors/envelope.js';
import { headersForError } from '../../errors/normalizeAiSdkError.js';
import { isClientAbort } from '../../errors/clientAbort.js';
import type { ModelCatalog, ModelCatalogEntry } from '../../providers/catalog.js';
import type { ProviderRegistry } from '../../providers/registry.js';
import { ensureRequestId } from '../../utils/requestId.js';

export type ModelsRouteContext = {
  registry: ProviderRegistry;
  catalog?: ModelCatalog;
};

type OpenAIModelObject = {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
};

function toOpenAIModelObject(entry: ModelCatalogEntry): OpenAIModelObject {
  return {
    id: entry.id,
    object: 'model',
    created: entry.created ? Math.floor(Date.parse(entry.created) / 1000) : 0,
    owned_by: entry.providers[0] ?? 'unknown',
  };
}

export function modelsRoute(ctx: ModelsRouteContext) {
  const app = new Hono();

  app.get('/models', (c) => {
    const isConfigured = (name: string) =>
      ctx.registry[name as keyof ProviderRegistry] != null;
    const data = Array.from(ctx.catalog?.values() ?? [])
      .filter((entry) => entry.providers.some(isConfigured))
      .map(toOpenAIModelObject);
    return c.json({ object: 'list' as const, data });
  });

  app.onError((err, c) => {
    if (isClientAbort(err, c.req.raw.signal)) {
      return new Response(null, { status: 499 });
    }
    const requestId = ensureRequestId(c.req.raw);
    c.header('x-request-id', requestId);
    const { body, status } = toOpenAIErrorResponse(err, { requestId });
    for (const [k, v] of Object.entries(headersForError(err, status))) {
      c.header(k, v);
    }
    return c.json(body, toContentfulStatus(status));
  });

  return app;
}
