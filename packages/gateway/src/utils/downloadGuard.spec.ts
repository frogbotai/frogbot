// Unit tests for the SSRF download guard (G33). All hermetic — literal-IP
// URLs never hit DNS, and the passthrough case never fetches.

import { describe, expect, it } from 'vitest';

import { assertPublicHttpsUrl, guardedDownload, isPrivateAddress } from './downloadGuard.js';

describe('isPrivateAddress', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.100.100.200', // CGNAT (Alibaba IMDS)
    '127.0.0.1',
    '169.254.169.254', // AWS/GCP/Azure IMDS
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fd00::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
  ])('flags %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.15.0.1',
    '172.32.0.1',
    '100.63.0.1',
    '100.128.0.1',
    '2606:4700::1111',
    '::ffff:8.8.8.8',
  ])('allows %s as public', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it('treats non-IP strings as unsafe', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});

describe('assertPublicHttpsUrl', () => {
  it('rejects http URLs', async () => {
    await expect(assertPublicHttpsUrl(new URL('http://example.com/'))).rejects.toThrow(
      'scheme "http:" is not allowed',
    );
  });

  it('rejects file URLs', async () => {
    await expect(assertPublicHttpsUrl(new URL('file:///etc/passwd'))).rejects.toThrow(
      'scheme "file:" is not allowed',
    );
  });

  it('rejects https URLs with a private literal IPv4 host', async () => {
    await expect(assertPublicHttpsUrl(new URL('https://169.254.169.254/'))).rejects.toThrow(
      'private, loopback, or link-local',
    );
  });

  it('rejects https URLs with a loopback IPv6 host', async () => {
    await expect(assertPublicHttpsUrl(new URL('https://[::1]:8443/'))).rejects.toThrow(
      'private, loopback, or link-local',
    );
  });

  it('accepts https URLs with a public literal IP host (no DNS needed)', async () => {
    await expect(assertPublicHttpsUrl(new URL('https://93.184.216.34/'))).resolves.toBeUndefined();
  });

  it('throws a 400 gateway error', async () => {
    const error = await assertPublicHttpsUrl(new URL('http://127.0.0.1/')).catch((err: unknown) => err);
    expect(error).toMatchObject({ status: 400, code: 'invalid_request_body' });
  });
});

describe('guardedDownload', () => {
  it('passes through model-supported URLs without validating or fetching', async () => {
    // Even a blatantly unsafe URL returns null (provider fetches server-side).
    const result = await guardedDownload([
      { url: new URL('http://169.254.169.254/'), isUrlSupportedByModel: true },
    ]);
    expect(result).toEqual([null]);
  });

  it('rejects unsupported URLs that fail the SSRF gate', async () => {
    await expect(
      guardedDownload([{ url: new URL('http://127.0.0.1:8080/'), isUrlSupportedByModel: false }]),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_request_body' });
  });
});
