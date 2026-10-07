import { describe, expect, it } from 'vitest';

import { anthropicAwsProvider } from '../../../../../packages/gateway/src/providers/anthropic-aws/index.js';
import { bedrockProvider } from '../../../../../packages/gateway/src/providers/bedrock/index.js';
import { testEnv } from '../../config/fixtures.js';

describe('anthropicAwsProvider.fromEnv', () => {
  it('enables the provider when ANTHROPIC_AWS_API_KEY is set', () => {
    const result = anthropicAwsProvider.fromEnv(
      testEnv({
        ANTHROPIC_AWS_API_KEY: 'key-123',
      }),
    );

    expect(result).toBeDefined();
    expect(result).toEqual({ apiKey: 'key-123' });
  });

  it('forwards ANTHROPIC_AWS_WORKSPACE_ID and AWS_REGION in API-key mode when set', () => {
    const result = anthropicAwsProvider.fromEnv(
      testEnv({
        ANTHROPIC_AWS_API_KEY: 'key-123',
        ANTHROPIC_AWS_WORKSPACE_ID: 'wrkspc_abc',
        AWS_REGION: 'us-west-2',
      }),
    );

    expect(result).toEqual({
      apiKey: 'key-123',
      region: 'us-west-2',
      workspaceId: 'wrkspc_abc',
    });
  });

  it('ANTHROPIC_AWS_API_KEY does NOT enable the bedrock provider', () => {
    expect(bedrockProvider.fromEnv(testEnv({ ANTHROPIC_AWS_API_KEY: 'key-123' }))).toBeUndefined();
  });

  it('AWS_BEARER_TOKEN_BEDROCK no longer enables anthropic-aws', () => {
    expect(
      anthropicAwsProvider.fromEnv(testEnv({ AWS_BEARER_TOKEN_BEDROCK: 'bearer-123' })),
    ).toBeUndefined();
  });

  it('enables SigV4 mode with a full AWS credential set (region required, no silent default)', () => {
    const result = anthropicAwsProvider.fromEnv(
      testEnv({
        AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        AWS_REGION: 'us-west-2',
        ANTHROPIC_AWS_WORKSPACE_ID: 'wrkspc_abc',
      }),
    );

    expect(result).toEqual({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-west-2',
      workspaceId: 'wrkspc_abc',
    });
  });

  it('returns undefined on partial SigV4 credentials (partial env skips — G41)', () => {
    expect(
      anthropicAwsProvider.fromEnv(testEnv({ AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE' })),
    ).toBeUndefined();
  });

  it('returns undefined when no credentials are present', () => {
    expect(anthropicAwsProvider.fromEnv(testEnv())).toBeUndefined();
  });

  it('SigV4 enables both providers, but provider-specific credentials enable exactly one', () => {
    const sigv4 = testEnv({
      AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
      AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      AWS_REGION: 'us-west-2',
    });

    expect(bedrockProvider.fromEnv(sigv4)).toBeDefined();
    expect(anthropicAwsProvider.fromEnv(sigv4)).toBeDefined();

    expect(
      anthropicAwsProvider.fromEnv(testEnv({ AWS_BEARER_TOKEN_BEDROCK: 'b' })),
    ).toBeUndefined();
    expect(bedrockProvider.fromEnv(testEnv({ ANTHROPIC_AWS_API_KEY: 'k' }))).toBeUndefined();
  });
});
