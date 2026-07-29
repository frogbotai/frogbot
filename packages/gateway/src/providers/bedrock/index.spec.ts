// Bedrock provider credential validation tests.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createAmazonBedrock } = vi.hoisted(() => ({
  createAmazonBedrock: vi.fn((config: unknown) => config),
}));
const { chain, fromNodeProviderChain } = vi.hoisted(() => ({
  chain: vi.fn(() => Promise.resolve({ accessKeyId: 'AKID', secretAccessKey: 'secret' })),
  fromNodeProviderChain: vi.fn(),
}));

vi.mock('@ai-sdk/amazon-bedrock', () => ({ createAmazonBedrock }));
vi.mock('@aws-sdk/credential-providers', () => ({ fromNodeProviderChain }));

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

  it('returns chain-backed config for an AWS profile', () => {
    expect(bedrockProvider.fromEnv({ AWS_PROFILE: 'dev' })).toEqual({
      region: 'us-east-1',
    });
  });

  it('returns chain-backed config for web identity', () => {
    expect(
      bedrockProvider.fromEnv({
        AWS_ROLE_ARN: 'arn:aws:iam::123456789012:role/test',
        AWS_WEB_IDENTITY_TOKEN_FILE: '/tmp/token',
        AWS_REGION: 'us-west-2',
      }),
    ).toEqual({ region: 'us-west-2' });
  });

  it('returns undefined for partial web identity configuration', () => {
    expect(
      bedrockProvider.fromEnv({ AWS_ROLE_ARN: 'arn:aws:iam::123456789012:role/test' }),
    ).toBeUndefined();
  });
});

describe('bedrockProvider.build', () => {
  beforeEach(() => {
    createAmazonBedrock.mockClear();
    chain.mockClear();
    fromNodeProviderChain.mockReset();
    fromNodeProviderChain.mockReturnValue(chain);
    for (const name of [
      'AWS_BEARER_TOKEN_BEDROCK',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_PROFILE',
      'AWS_ROLE_ARN',
      'AWS_WEB_IDENTITY_TOKEN_FILE',
    ]) {
      vi.stubEnv(name, '');
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('preserves explicit SigV4 environment credentials', () => {
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'AKID');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'secret');
    const config = { region: 'us-east-1' };

    bedrockProvider.build(config);

    expect(createAmazonBedrock).toHaveBeenCalledWith(config);
  });

  it('preserves bearer token authentication', () => {
    const config = { apiKey: 'token-123', region: 'us-east-1' };

    bedrockProvider.build(config);

    expect(createAmazonBedrock).toHaveBeenCalledWith(config);
  });

  it('forwards a configured credential provider by reference', () => {
    const credentialProvider = vi.fn();
    const config = { region: 'us-east-1', credentialProvider };

    bedrockProvider.build(config);

    expect(createAmazonBedrock).toHaveBeenCalledWith(config);
    expect(createAmazonBedrock.mock.calls[0]?.[0]).toHaveProperty(
      'credentialProvider',
      credentialProvider,
    );
  });

  it('injects default-chain credentials for region-only configuration', async () => {
    bedrockProvider.build({ region: 'us-east-1' });

    const config = createAmazonBedrock.mock.calls[0]?.[0] as {
      credentialProvider: () => Promise<unknown>;
    };
    await config.credentialProvider();
    await config.credentialProvider();
    expect(fromNodeProviderChain).toHaveBeenCalledOnce();
    expect(chain).toHaveBeenCalledTimes(2);
  });

  it('injects default-chain credentials for an AWS profile', () => {
    vi.stubEnv('AWS_PROFILE', 'dev');

    bedrockProvider.build({ region: 'us-east-1' });

    expect(createAmazonBedrock.mock.calls[0]?.[0]).toHaveProperty(
      'credentialProvider',
      expect.any(Function),
    );
  });

  it('injects default-chain credentials for web identity', () => {
    vi.stubEnv('AWS_ROLE_ARN', 'arn:aws:iam::123456789012:role/test');
    vi.stubEnv('AWS_WEB_IDENTITY_TOKEN_FILE', '/tmp/token');

    bedrockProvider.build({ region: 'us-east-1' });

    expect(createAmazonBedrock.mock.calls[0]?.[0]).toHaveProperty(
      'credentialProvider',
      expect.any(Function),
    );
  });
});
