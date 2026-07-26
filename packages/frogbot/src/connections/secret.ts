import type { Endpoint } from '../types/endpoint.js';
import type { Piece } from '../types/piece.js';
import type { SanitizedConnectionsConfig } from '../types/connections.js';

type SecretBody = {
  service?: unknown;
  credentials?: unknown;
  accountId?: unknown;
  accountLabel?: unknown;
};

function credentialData(piece: Piece, credentials: Record<string, unknown>): { encrypted: Record<string, unknown>; metadata: Record<string, unknown> } {
  if (piece.credentialType === 'secret_text') {
    if (typeof credentials.value !== 'string' || !credentials.value) throw new Error('A secret value is required.');
    return { encrypted: { value: credentials.value }, metadata: {} };
  }
  if (piece.credentialType === 'basic_auth') {
    if (typeof credentials.username !== 'string' || typeof credentials.password !== 'string') throw new Error('Username and password are required.');
    return { encrypted: { username: credentials.username, password: credentials.password }, metadata: {} };
  }
  if (piece.credentialType !== 'custom' || !piece.credentialFields) throw new Error('This piece does not accept secret credentials.');
  const unknown = Object.keys(credentials).filter((key) => !piece.credentialFields?.[key]);
  if (unknown.length) throw new Error(`Unknown credential fields: ${unknown.join(', ')}.`);
  const missing = Object.keys(piece.credentialFields).filter((key) => credentials[key] === undefined);
  if (missing.length) throw new Error(`Missing credential fields: ${missing.join(', ')}.`);
  const encrypted: Record<string, unknown> = {};
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(credentials)) {
    (piece.credentialFields[key]?.secret === false ? metadata : encrypted)[key] = value;
  }
  return { encrypted, metadata };
}

export function builtInSecretSource(pieces: readonly Piece[]) {
  return {
    key: 'secret',
    services: pieces.filter((piece) => piece.policy.type === 'user' && ['secret_text', 'basic_auth', 'custom', 'service_account'].includes(piece.credentialType)).map((piece) => piece.service),
    credentialTypes: ['secret_text', 'basic_auth', 'custom'] as const,
  };
}

export function builtInDeveloperSources(pieces: readonly Piece[]) {
  return pieces.flatMap((piece) => piece.policy.type === 'developer' && piece.credentialType !== 'none' ? [{
    key: `config:${piece.service}`,
    services: [piece.service],
    credentialTypes: [piece.credentialType],
    policy: 'developer' as const,
    resolve: () => import('./adapters.js').then(({ adaptCredential }) => adaptCredential(piece.credentialType as Exclude<typeof piece.credentialType, 'none'>, piece.policy.type === 'developer' && typeof piece.policy.credential === 'object' && piece.policy.credential ? piece.policy.credential as Record<string, unknown> : { value: piece.policy.type === 'developer' ? piece.policy.credential : '' })),
  }] : []);
}

export function buildSecretEndpoints({ connections, pieces }: { connections: SanitizedConnectionsConfig; pieces: readonly Piece[] }): Endpoint[] {
  if (!connections.enabled || !connections.slug) return [];
  const save = (replace: boolean): Endpoint => ({
    method: replace ? 'put' : 'post',
    path: '/connections/secret',
    handler: async (req) => {
      if (!req.user) return Response.json({ error: 'Authentication required' }, { status: 401 });
      const body = (await req.json?.().catch(() => null)) as SecretBody | null;
      if (!body || typeof body.service !== 'string' || !body.credentials || typeof body.credentials !== 'object' || Array.isArray(body.credentials)) {
        return Response.json({ error: 'Service and credentials are required' }, { status: 400 });
      }
      const piece = pieces.find((item) => item.service === body.service);
      if (!piece) return Response.json({ error: 'Piece not found' }, { status: 404 });
      let values: ReturnType<typeof credentialData>;
      try {
        values = credentialData(piece, body.credentials as Record<string, unknown>);
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'Invalid credentials' }, { status: 400 });
      }
      const encryptedCredentials = await connections.encryption.encrypt(JSON.stringify(values.encrypted));
      const existing = await req.frogbot.find({
        collection: connections.slug as never,
        where: { and: [{ owner: { equals: req.user.id } }, { sourceKey: { equals: connections.assignments[body.service] } }] },
        limit: 1,
        overrideAccess: true,
        req,
      });
      if (existing.docs.length && !replace) return Response.json({ error: 'Connection already exists' }, { status: 409 });
      const data = {
        owner: req.user.id,
        services: [body.service],
        source: 'secret',
        sourceKey: 'secret',
        credentialType: piece.credentialType,
        encryptedCredentials,
        metadata: values.metadata,
        accountId: typeof body.accountId === 'string' ? body.accountId : undefined,
        accountLabel: typeof body.accountLabel === 'string' ? body.accountLabel : undefined,
        status: 'active',
      };
      const doc = existing.docs.length
        ? await req.frogbot.update({ collection: connections.slug as never, id: existing.docs[0].id, data, overrideAccess: true, req })
        : await req.frogbot.create({ collection: connections.slug as never, data, overrideAccess: true, req });
      return Response.json({ id: doc.id, service: body.service, status: 'active' }, { status: existing.docs.length ? 200 : 201 });
    },
  });
  return [
    save(false),
    save(true),
    {
      method: 'delete',
      path: '/connections/secret',
      handler: async (req) => {
        if (!req.user) return Response.json({ error: 'Authentication required' }, { status: 401 });
        const body = (await req.json?.().catch(() => null)) as { service?: unknown } | null;
        if (typeof body?.service !== 'string') return Response.json({ error: 'Service is required' }, { status: 400 });
        const existing = await req.frogbot.find({
          collection: connections.slug as never,
          where: { and: [{ owner: { equals: req.user.id } }, { sourceKey: { equals: connections.assignments[body.service] } }] },
          limit: 1,
          overrideAccess: true,
          req,
        });
        if (!existing.docs.length) return Response.json({ error: 'Connection not found' }, { status: 404 });
        const doc = await req.frogbot.update({
          collection: connections.slug as never,
          id: existing.docs[0].id,
          data: { status: 'revoked', encryptedCredentials: '' },
          overrideAccess: true,
          req,
        });
        return Response.json({ id: doc.id, status: 'revoked' });
      },
    },
  ];
}
