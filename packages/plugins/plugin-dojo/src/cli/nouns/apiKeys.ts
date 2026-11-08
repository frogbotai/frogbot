import type { Noun } from '../command.js';
import { dojoJSON, dojoList, dojoMessage, segment } from '../dojo.js';
import { ShareError } from '../error.js';
import { done } from '../io.js';

type ApiKey = {
  id: string | number;
  name: string;
  prefix: string;
  canMint?: boolean | null;
  mintedBy?: string | number | { id: string | number } | null;
  lastUsedAt?: string | null;
  createdAt: string;
};

type Minted = { id: string | number; name: string; prefix: string; token: string };

const relation = (value: ApiKey['mintedBy']) =>
  value && typeof value === 'object' ? value.id : (value ?? null);

/** `keys list | create | revoke`: your Dojo API keys, for scripts, CI and agents (D4). */
export const apiKeys: Noun = {
  summary: 'List, create and revoke your Dojo API keys.',
  verbs: {
    list: {
      summary: 'List your keys that are not revoked, with the key that made each one.',
      run: async ({ io, dojo }) => {
        const docs = await dojoList<ApiKey>(
          dojo(),
          '/api/api-keys?depth=0&limit=100&sort=-createdAt&where[revokedAt][exists]=false',
          { what: "Couldn't list your API keys" },
        );

        const listed = docs.map(
          ({ id, name, prefix, canMint, mintedBy, lastUsedAt, createdAt }) => ({
            id,
            name,
            prefix,
            canMint: canMint === true,
            mintedBy: relation(mintedBy),
            lastUsedAt: lastUsedAt ?? null,
            createdAt,
          }),
        );

        done(
          io,
          listed,
          listed.map(
            ({ id, name, prefix, mintedBy }) =>
              `${id}  ${prefix}…  ${name}${mintedBy === null ? '' : `  (made by key ${mintedBy})`}`,
          ),
        );
      },
    },
    create: {
      summary: 'Create a key and print it once. It is never broader than the sign-in that made it.',
      args: '<name>',
      flags: {
        'can-mint': { type: 'boolean', help: 'Let the new key create keys too.' },
      },
      run: async ({ io, dojo, positionals: [name = ''], values }) => {
        const client = dojo();
        const canMint = values['can-mint'] === true;

        const response = await client.request('/api/api-keys/mint', () => ({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, data: canMint ? { canMint } : {} }),
        }));

        if (response.status === 403) {
          throw new ShareError(
            `This sign-in can't create keys yet: ${await dojoMessage(response)} Create one at ${client.url}/collections/api-keys`,
          );
        }

        if (!response.ok) {
          throw new ShareError(`Couldn't create the key: ${await dojoMessage(response)}`);
        }

        const minted = (await response.json()) as Minted;

        done(io, minted, [
          `[frogbot] Created ${minted.name} (${minted.id}). Copy it now; Dojo won't show it again:`,
          minted.token,
        ]);
      },
    },
    revoke: {
      summary: 'Revoke a key by id, and the keys it made. Requests made with them stop working.',
      args: '<id>',
      flags: {
        'no-cascade': { type: 'boolean', help: 'Revoke only this key; keep the keys it made.' },
      },
      confirm: ({ positionals: [id], values }) =>
        values['no-cascade'] === true
          ? `Revoke key ${id}? The keys it made keep working.`
          : `Revoke key ${id} and the keys it made?`,
      run: async ({ io, dojo, positionals: [id = ''], values }) => {
        const keep = values['no-cascade'] === true;
        const revoked = await dojoJSON<{ id: string | number; revokedAt: string }>(
          dojo(),
          `/api/api-keys/${segment(id)}/revoke`,
          {
            method: 'POST',
            ...(keep && { body: { cascade: false } }),
            what: `Couldn't revoke key ${id}`,
          },
        );

        done(io, revoked, [
          `[frogbot] Revoked key ${revoked.id}${keep ? '; the keys it made keep working' : ' and the keys it made'}.`,
        ]);
      },
    },
  },
};
