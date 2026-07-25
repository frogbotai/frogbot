import { describe, expect, it, vi } from 'vitest';

import type { Piece } from '../types/piece.js';
import { createCredentialEncryption } from './encryption.js';
import { buildSecretEndpoints } from './secret.js';

const pieces: Piece[] = [
  { service: 'resend', credentialType: 'secret_text', actions: [], tools: () => [] },
  { service: 'twilio', credentialType: 'basic_auth', actions: [], tools: () => [] },
  {
    service: 'vertex',
    credentialType: 'custom',
    credentialFields: { serviceAccountJson: {}, region: { secret: false } },
    actions: [],
    tools: () => [],
  },
];

function setup() {
  const encryption = createCredentialEncryption({ secret: 'secret' });
  const create = vi.fn(async ({ data }) => ({ id: 'new', ...data }));
  const update = vi.fn(async ({ id, data }) => ({ id, ...data }));
  const find = vi.fn(async () => ({ docs: [] }));
  const endpoints = buildSecretEndpoints({
    connections: { enabled: true, slug: 'connections', encryption, sources: [], assignments: {} },
    pieces,
  });
  const request = (body: unknown, user: unknown = { id: 'owner' }) => ({
    user,
    json: async () => body,
    frogbot: { create, update, find },
  }) as never;
  return { encryption, create, update, find, endpoints, request };
}

describe('secret connection endpoints', () => {
  it.each([
    ['resend', { value: 'key' }, { value: 'key' }],
    ['twilio', { username: 'user', password: 'pass' }, { username: 'user', password: 'pass' }],
  ])('stores %s credentials as one encrypted document', async (service, credentials, expected) => {
    const { endpoints, request, create, encryption } = setup();
    const response = await endpoints[0]!.handler(request({ service, credentials }));
    expect(response.status).toBe(201);
    const encrypted = create.mock.calls[0]![0].data.encryptedCredentials;
    expect(JSON.parse(await encryption.decrypt(encrypted))).toEqual(expected);
  });

  it('stores custom secrets byte-identically and instance values as metadata', async () => {
    const { endpoints, request, create, encryption } = setup();
    const serviceAccountJson = '{"private_key":"line1\\nline2"}';
    await endpoints[0]!.handler(request({ service: 'vertex', credentials: { serviceAccountJson, region: 'us-east1' } }));
    const data = create.mock.calls[0]![0].data;
    expect(JSON.parse(await encryption.decrypt(data.encryptedCredentials))).toEqual({ serviceAccountJson });
    expect(data.metadata).toEqual({ region: 'us-east1' });
  });

  it('rejects unknown custom fields and unauthenticated submissions', async () => {
    const { endpoints, request } = setup();
    const invalid = await endpoints[0]!.handler(request({ service: 'vertex', credentials: { serviceAccountJson: '{}', region: 'x', extra: true } }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Unknown credential fields: extra.' });
    expect((await endpoints[0]!.handler(request({}, null))).status).toBe(401);
  });

  it('replaces and revokes only owner-scoped records', async () => {
    const { endpoints, request, find, update } = setup();
    find.mockResolvedValue({ docs: [{ id: 'existing' }] });
    expect((await endpoints[1]!.handler(request({ service: 'resend', credentials: { value: 'new' } }))).status).toBe(200);
    expect((await endpoints[2]!.handler(request({ service: 'resend' }))).status).toBe(200);
    expect(find.mock.calls[0]![0].where.and[0]).toEqual({ owner: { equals: 'owner' } });
    expect(update.mock.calls[1]![0].data).toEqual({ status: 'revoked', encryptedCredentials: '' });
  });
});
