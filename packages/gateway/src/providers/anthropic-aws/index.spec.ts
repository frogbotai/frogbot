// anthropic-aws provider credential validation tests.
//
// G40 (PR6, FIXED): the "anthropic-aws" provider now wraps `createAnthropicAws`
// from `@ai-sdk/anthropic-aws` (the native Anthropic-on-AWS wire format), not
// `createAmazonBedrock`. Its `fromEnv` gate reads the provider-named
// `ANTHROPIC_AWS_API_KEY` first, then falls back to AWS SigV4 credentials —
// and no longer reads `AWS_BEARER_TOKEN_BEDROCK`, so a Bedrock bearer token
// enables only the bedrock provider.

import { describe, expect, it } from 'vitest';

import { anthropicAwsProvider } from './index.js';
import { bedrockProvider } from '../bedrock/index.js';

describe('anthropicAwsProvider.fromEnv', () => {
  // An operator who reads "anthropic-aws" and sets ANTHROPIC_AWS_API_KEY (the
  // provider-named key) expects the provider to turn on.
  it('enables the provider when ANTHROPIC_AWS_API_KEY is set', () => {
    // G40 — provider-named credential var enables API-key mode.
    const result = anthropicAwsProvider.fromEnv({
      ANTHROPIC_AWS_API_KEY: 'key-123',
    });
    expect(result).toBeDefined();
    expect(result).toEqual({ apiKey: 'key-123' });
  });

  it('forwards ANTHROPIC_AWS_WORKSPACE_ID and AWS_REGION in API-key mode when set', () => {
    const result = anthropicAwsProvider.fromEnv({
      ANTHROPIC_AWS_API_KEY: 'key-123',
      ANTHROPIC_AWS_WORKSPACE_ID: 'wrkspc_abc',
      AWS_REGION: 'us-west-2',
    });
    expect(result).toEqual({
      apiKey: 'key-123',
      region: 'us-west-2',
      workspaceId: 'wrkspc_abc',
    });
  });

  it('ANTHROPIC_AWS_API_KEY does NOT enable the bedrock provider', () => {
    expect(bedrockProvider.fromEnv({ ANTHROPIC_AWS_API_KEY: 'key-123' })).toBeUndefined();
  });

  it('AWS_BEARER_TOKEN_BEDROCK no longer enables anthropic-aws', () => {
    // The bedrock bearer token is a Bedrock-only credential; the dedicated
    // anthropic-aws SDK does not support it.
    expect(
      anthropicAwsProvider.fromEnv({ AWS_BEARER_TOKEN_BEDROCK: 'bearer-123' }),
    ).toBeUndefined();
  });

  it('enables SigV4 mode with a full AWS credential set (region required, no silent default)', () => {
    const result = anthropicAwsProvider.fromEnv({
      AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
      AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      AWS_REGION: 'us-west-2',
      ANTHROPIC_AWS_WORKSPACE_ID: 'wrkspc_abc',
    });
    expect(result).toEqual({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-west-2',
      workspaceId: 'wrkspc_abc',
    });
  });

  it('returns undefined on partial SigV4 credentials (partial env skips — G41)', () => {
    expect(
      anthropicAwsProvider.fromEnv({ AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE' }),
    ).toBeUndefined();
  });

  it('returns undefined when no credentials are present', () => {
    expect(anthropicAwsProvider.fromEnv({})).toBeUndefined();
  });

  // A shared AWS SigV4 credential set still enables both providers (they are
  // both legitimate consumers of AWS credentials), but the auth surfaces are
  // now distinct: API-key mode is anthropic-aws-only, bearer-token mode is
  // bedrock-only.
  it('SigV4 enables both providers, but provider-specific credentials enable exactly one', () => {
    const sigv4 = {
      AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
      AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      AWS_REGION: 'us-west-2',
    };
    expect(bedrockProvider.fromEnv(sigv4)).toBeDefined();
    expect(anthropicAwsProvider.fromEnv(sigv4)).toBeDefined();

    // Provider-specific credentials no longer cross-enable.
    expect(anthropicAwsProvider.fromEnv({ AWS_BEARER_TOKEN_BEDROCK: 'b' })).toBeUndefined();
    expect(bedrockProvider.fromEnv({ ANTHROPIC_AWS_API_KEY: 'k' })).toBeUndefined();
  });
});
