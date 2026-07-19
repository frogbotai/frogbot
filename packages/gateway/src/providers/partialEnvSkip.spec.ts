// G41 (PR7, FIXED): provider `fromEnv` used to throw on common partial env,
// aborting zero-config boot.
//
// The provider contract (providers/types.ts:25-30) says `fromEnv` returns
// `undefined` when the credential gate is absent — "signals the CLI to SKIP
// this provider rather than throw". bedrock/vertex/azure/anthropic-aws now
// skip (return `undefined`) when a *secondary* var is present without the
// full credential set, and `cli/index.ts buildProvidersFromEnv` additionally
// wraps each `fromEnv` in a try/catch so one bad provider env (e.g.
// AWS_REGION, which every EC2/ECS/CI runner sets) can never make
// `bunx gateway` exit 1 before serving.

import { describe, expect, it } from 'vitest';

import { bedrockProvider } from './bedrock/index.js';
import { vertexProvider } from './vertex/index.js';
import { azureProvider } from './azure/index.js';

describe('provider fromEnv skips (not throws) on common partial env — G41', () => {
  // AWS_REGION alone is set on virtually every AWS runtime (EC2/ECS/Lambda/CI).
  // Per the contract, no AWS *credential* gate => skip bedrock.
  it('bedrock returns undefined when only AWS_REGION is set', () => {
    // G41 — partial AWS env skips instead of throwing.
    const result = bedrockProvider.fromEnv({ AWS_REGION: 'us-east-1' });
    expect(result).toBeUndefined();
  });

  // GOOGLE_VERTEX_PROJECT alone (common on GCP) has no API key and no location,
  // so Vertex can't be configured — the contract says skip.
  it('vertex returns undefined when only GOOGLE_VERTEX_PROJECT is set', () => {
    // G41 — partial Vertex env skips instead of throwing.
    const result = vertexProvider.fromEnv({ GOOGLE_VERTEX_PROJECT: 'my-project' });
    expect(result).toBeUndefined();
  });

  // AZURE_API_KEY without a resource name or base URL can't build a client, so
  // per the contract Azure skips.
  it('azure returns undefined when AZURE_API_KEY is set without resource/baseURL', () => {
    // G41 — partial Azure env skips instead of throwing.
    const result = azureProvider.fromEnv({ AZURE_API_KEY: 'azure-key-123' });
    expect(result).toBeUndefined();
  });
});
