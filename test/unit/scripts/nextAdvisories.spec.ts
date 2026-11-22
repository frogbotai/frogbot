import { describe, expect, it, vi } from 'vitest';

import { nextAdvisories } from '../../../scripts/next-advisories.mjs';

const packument = (versions: string[]) =>
  Response.json({ versions: Object.fromEntries(versions.map((version) => [version, {}])) });

function bulk(advisories: { severity: string; title: string; vulnerable_versions: string }[]) {
  return vi.fn<typeof fetch>((input) =>
    Promise.resolve(
      String(input).endsWith('/advisories/bulk')
        ? Response.json({
            next: advisories.map((advisory, id) => ({ id, url: `https://x/${id}`, ...advisory })),
          })
        : packument(['16.4.6', '16.5.0']),
    ),
  );
}

describe('next-advisories', () => {
  it('passes when the catalog next is clean', async () => {
    expect(await nextAdvisories({ fetch: bulk([]), version: '16.4.6' })).toEqual({
      code: 0,
      lines: ['✔ next 16.4.6 in the catalog has no npm security advisories.'],
    });
  });

  it('fails and names the patched version', async () => {
    const fetch = vi.fn<typeof fetch>((input, init) => {
      const version = (JSON.parse(String(init?.body ?? '{"next":[]}')) as { next: string[] })
        .next[0];

      return Promise.resolve(
        String(input).endsWith('/advisories/bulk') && version === '16.4.2'
          ? Response.json({
              next: [
                {
                  id: 1,
                  severity: 'moderate',
                  title: 'SVG bypass',
                  url: 'https://x/1',
                  vulnerable_versions: '>=16.0.0 <=16.4.4',
                },
              ],
            })
          : String(input).endsWith('/advisories/bulk')
            ? Response.json({ next: [] })
            : packument(['16.4.2', '16.4.5']),
      );
    });

    const result = await nextAdvisories({ fetch, version: '16.4.2' });

    expect(result.code).toBe(1);
    expect(result.lines.join('\n')).toContain('moderate · SVG bypass (>=16.0.0 <=16.4.4)');
    expect(result.lines.at(-1)).toContain('next 16.4.5');
  });

  it('fails when no fix is inside the peer range', async () => {
    const fetch = bulk([
      { severity: 'high', title: 'all', vulnerable_versions: '>=16.0.0 <17.0.0' },
    ]);

    const result = await nextAdvisories({ fetch, version: '16.4.6' });

    expect(result.code).toBe(1);
    expect(result.lines.at(-1)).toContain('peer range has to move');
  });

  it('names the next minor instead of blaming the registry when no later patch is published', async () => {
    const fetch = vi.fn<typeof fetch>((input, init) => {
      if (!String(input).endsWith('/advisories/bulk')) {
        return Promise.resolve(packument(['16.4.5', '16.4.6', '16.5.0']));
      }

      const version = (JSON.parse(String(init?.body)) as { next: string[] }).next[0];

      return Promise.resolve(
        Response.json({
          next: version.startsWith('16.4.')
            ? [
                {
                  id: 1,
                  severity: 'high',
                  title: 'x',
                  url: 'https://x/1',
                  vulnerable_versions: '>=16.0.0 <=16.4.6',
                },
              ]
            : [],
        }),
      );
    });

    const result = await nextAdvisories({ fetch, version: '16.4.6' });

    expect(result.code).toBe(1);
    expect(result.lines.at(-1)).toContain('next 16.5.0');
  });

  it('names a range it cannot read instead of blaming the registry', async () => {
    const fetch = bulk([{ severity: 'high', title: 'odd', vulnerable_versions: '^16.0.0' }]);
    const result = await nextAdvisories({ fetch, version: '16.4.6' });

    expect(result).toEqual({
      code: 1,
      lines: ["✖ Couldn't check next 16.4.6: can't read the ranges for next 16.4.6."],
    });
  });

  it('fails when npm cannot be reached', async () => {
    const fetch = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));

    expect(await nextAdvisories({ fetch, version: '16.4.6' })).toMatchObject({ code: 1 });
  });
});
