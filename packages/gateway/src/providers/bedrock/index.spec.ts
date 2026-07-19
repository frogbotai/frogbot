// Bedrock provider credential validation tests.

import { describe, expect, it } from 'vitest';

import { bedrockProvider } from './index.js';

describe('bedrockProvider.fromEnv', () => {
  it('returns undefined when no AWS credentials are present', () => {
    const result = bedrockProvider.fromEnv({});
    expect(result).toBeUndefined();
  });

  it('returns bearer token config when AWS_BEARER_TOKEN_BEDROCK is set', () => {
    const result = bedrockProvider.fromEnv({
      AWS_BEARER_TOKEN_BEDROCK: 'token-123',
    });
    expect(result).toEqual({
      apiKey: 'token-123',
      region: 'us-east-1',
    });
  });

  it('respects AWS_REGION in bearer token mode', () => {
    const result = bedrockProvider.fromEnv({
      AWS_BEARER_TOKEN_BEDROCK: 'token-123',
      AWS_REGION: 'eu-west-1',
    });
    expect(result).toEqual({
      apiKey: 'token-123',
      region: 'eu-west-1',
    });
  });

  it('returns SigV4 config when all three core credentials are set', () => {
    const result = bedrockProvider.fromEnv({
      AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
      AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      AWS_REGION: 'us-west-2',
    });
    expect(result).toEqual({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-west-2',
    });
  });

  it('includes sessionToken when AWS_SESSION_TOKEN is set', () => {
    const result = bedrockProvider.fromEnv({
      AWS_ACCESS_KEY_ID: 'AKID',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_REGION: 'us-east-1',
      AWS_SESSION_TOKEN: 'session-token',
    });
    expect(result).toEqual({
      accessKeyId: 'AKID',
      secretAccessKey: 'secret',
      region: 'us-east-1',
      sessionToken: 'session-token',
    });
  });

  it('returns undefined when only access key is provided (partial SigV4 skips — G41)', () => {
    expect(bedrockProvider.fromEnv({ AWS_ACCESS_KEY_ID: 'AKID' })).toBeUndefined();
  });

  it('returns undefined when secret key is missing (partial SigV4 skips — G41)', () => {
    expect(
      bedrockProvider.fromEnv({
        AWS_ACCESS_KEY_ID: 'AKID',
        AWS_REGION: 'us-east-1',
      }),
    ).toBeUndefined();
  });

  it('bearer token takes priority over SigV4 when both are set', () => {
    const result = bedrockProvider.fromEnv({
      AWS_BEARER_TOKEN_BEDROCK: 'token-123',
      AWS_ACCESS_KEY_ID: 'AKID',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_REGION: 'us-east-1',
    });
    expect(result).toEqual({
      apiKey: 'token-123',
      region: 'us-east-1',
    });
  });
});
