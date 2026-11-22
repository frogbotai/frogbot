import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  checkNextAdvisories,
  findNextFix,
  NEXT_PEER_RANGE,
} from '../../../../packages/frogbot/src/bin/nextAdvisories.js';

const repoRoot = join(import.meta.dirname, '..', '..', '..', '..');

const advisory = (id: number, vulnerable_versions: string, severity = 'moderate') => ({
  id,
  severity,
  title: `advisory ${id}`,
  url: `https://github.com/advisories/${id}`,
  vulnerable_versions,
});

type Registry = {
  advisories: Record<string, ReturnType<typeof advisory>[]>;
  missing?: string[];
};

function fakeRegistry({ advisories, missing = [] }: Registry) {
  return vi.fn<typeof fetch>((input, init) => {
    const url = String(input);

    if (url.endsWith('/-/npm/v1/security/advisories/bulk')) {
      const body = JSON.parse(String(init?.body)) as { next: string[] };

      return Promise.resolve(Response.json({ next: advisories[body.next[0]] ?? [] }));
    }

    const version = url.split('/').at(-1) ?? '';

    return Promise.resolve(
      missing.includes(version)
        ? new Response('not found', { status: 404 })
        : Response.json({ version }),
    );
  });
}

describe('findNextFix', () => {
  it('picks the first version past every advisory inside the peer range', () => {
    expect(
      findNextFix({
        peerRange: NEXT_PEER_RANGE,
        version: '16.4.2',
        vulnerableRanges: ['>=16.0.0 <=16.4.4', '>=16.4.0 <16.4.3'],
      }),
    ).toBe('16.4.5');
  });

  it('returns nothing when the fix is outside the peer range', () => {
    expect(
      findNextFix({
        peerRange: NEXT_PEER_RANGE,
        version: '16.9.0',
        vulnerableRanges: ['>=16.0.0 <17.0.0'],
      }),
    ).toBeUndefined();
  });

  it('never suggests a downgrade', () => {
    expect(
      findNextFix({
        peerRange: NEXT_PEER_RANGE,
        version: '16.4.8',
        vulnerableRanges: ['>=16.4.7 <16.4.10'],
      }),
    ).toBe('16.4.10');
  });

  it('reads `||` unions and exact versions', () => {
    expect(
      findNextFix({
        peerRange: NEXT_PEER_RANGE,
        version: '16.4.0',
        vulnerableRanges: ['<16.4.2 || 16.4.3', '16.4.2'],
      }),
    ).toBe('16.4.4');
  });

  it('reads prerelease and partial bounds the way npm writes them', () => {
    expect(
      findNextFix({
        peerRange: NEXT_PEER_RANGE,
        version: '16.4.6',
        vulnerableRanges: ['>=16.4.0-canary.0 <16.4.8', '>=16.4 <16.4.7'],
      }),
    ).toBe('16.4.8');

    expect(
      findNextFix({
        peerRange: NEXT_PEER_RANGE,
        version: '16.4.2',
        vulnerableRanges: ['>=16.0.0-canary.0 <16.4.9-canary.0', '<=16.3'],
      }),
    ).toBe('16.4.9');

    expect(
      findNextFix({ peerRange: '>=15.0.0 <16.0.0', version: '15.0.0', vulnerableRanges: ['15.0'] }),
    ).toBe('15.1.0');
  });

  it('finds a release fix for an installed canary', () => {
    expect(
      findNextFix({
        peerRange: '>=16.4.0-0 <17.0.0',
        version: '16.5.0-canary.3',
        vulnerableRanges: ['>=16.5.0-canary.0 <16.5.0'],
      }),
    ).toBe('16.5.0');
  });

  it('throws on a range it cannot read', () => {
    expect(() =>
      findNextFix({ peerRange: NEXT_PEER_RANGE, version: '16.4.2', vulnerableRanges: ['^16'] }),
    ).toThrow("can't read the ranges");
  });

  it('matches the peer range @frogbotai/next declares', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'packages/next/package.json'), 'utf8')) as {
      peerDependencies: Record<string, string>;
    };

    expect(NEXT_PEER_RANGE).toBe(pkg.peerDependencies.next);
  });
});

describe('checkNextAdvisories', () => {
  it('reports the advisories and the published, clean fix', async () => {
    const fetch = fakeRegistry({
      advisories: {
        '16.4.2': [advisory(1, '>=16.0.0 <=16.4.4'), advisory(2, '>=16.4.0 <=16.4.4')],
      },
    });

    const report = await checkNextAdvisories({ fetch, version: '16.4.2' });

    expect(report?.advisories.map((entry) => entry.id)).toEqual([1, 2]);
    expect(report?.advisories[0]?.vulnerableVersions).toBe('>=16.0.0 <=16.4.4');
    expect(report?.fix).toBe('16.4.5');
  });

  it('skips a fix that has its own advisory or was never published', async () => {
    const fetch = fakeRegistry({
      advisories: {
        '16.4.2': [advisory(1, '>=16.0.0 <=16.4.4')],
        '16.4.5': [advisory(3, '16.4.5', 'high')],
      },
      missing: ['16.4.6'],
    });

    const report = await checkNextAdvisories({ fetch, version: '16.4.2' });

    expect(report?.advisories.map((entry) => entry.id)).toEqual([1]);
    expect(report?.fix).toBe('16.4.7');
  });

  it('says a FrogBot release is needed when no fix is in range', async () => {
    const fetch = fakeRegistry({ advisories: { '16.4.2': [advisory(1, '>=16.0.0 <17.0.0')] } });

    expect(await checkNextAdvisories({ fetch, version: '16.4.2' })).toMatchObject({
      fix: undefined,
      peerRange: NEXT_PEER_RANGE,
    });
  });

  it('reports a clean version as its own fix', async () => {
    const fetch = fakeRegistry({ advisories: {} });

    expect(await checkNextAdvisories({ fetch, version: '16.4.6' })).toEqual({
      advisories: [],
      fix: '16.4.6',
      peerRange: NEXT_PEER_RANGE,
      version: '16.4.6',
    });
  });

  it('throws instead of reporting offline when a range cannot be read', async () => {
    const fetch = fakeRegistry({ advisories: { '16.4.2': [advisory(1, '^16.0.0')] } });

    await expect(checkNextAdvisories({ fetch, version: '16.4.2' })).rejects.toThrow(
      "can't read the ranges",
    );
  });

  it('names the fix for a canary-bounded advisory', async () => {
    const fetch = fakeRegistry({
      advisories: { '16.4.6': [advisory(1, '>=16.4.0-canary.0 <16.4.8')] },
    });

    expect(await checkNextAdvisories({ fetch, version: '16.4.6' })).toMatchObject({
      fix: '16.4.8',
    });
  });

  it('returns nothing when the registry fails or is unreachable', async () => {
    const down = vi.fn<typeof fetch>(() => Promise.resolve(new Response('busy', { status: 503 })));
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));

    expect(await checkNextAdvisories({ fetch: down, version: '16.4.2' })).toBeUndefined();
    expect(await checkNextAdvisories({ fetch: offline, version: '16.4.2' })).toBeUndefined();
  });
});
