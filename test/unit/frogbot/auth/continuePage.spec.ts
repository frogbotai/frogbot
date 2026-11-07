import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  ADMIN_COLORS,
  adminTheme,
  type ContinueLook,
  continueLook,
  continuePage,
} from '../../../../packages/frogbot/src/auth/signIn/continuePage.js';
import { readPayloadTokens } from '../../../../scripts/sync-payload-tokens.mjs';

const resolve = (tokens: [string, string][], name: string) => {
  const lookup = new Map(tokens);
  let value = lookup.get(name)!;

  for (let match = /^var\((--[\w-]+)\)$/.exec(value); match;) {
    value = lookup.get(match[1])!;
    match = /^var\((--[\w-]+)\)$/.exec(value);
  }

  return value;
};

const config = ({
  theme = 'all',
  cookiePrefix = 'payload',
  admin = '/admin',
}: { theme?: 'all' | 'dark' | 'light'; cookiePrefix?: string; admin?: string } = {}) => ({
  admin: { theme, user: 'users' },
  cookiePrefix,
  routes: { admin },
});

const cookies = (cookie?: string) => new Headers(cookie ? { cookie } : {});

const page = (look: ContinueLook, returnTo = '/admin', lang = 'en') =>
  continuePage({ returnTo, look, lang, loading: 'Loading', next: 'Next' });

describe('sign-in continue page', () => {
  it("matches the admin's --color-bg and --color-text in Payload's light and dark tokens", () => {
    const { page: base, dark } = readPayloadTokens();

    for (const [theme, tokens] of [
      ['light', base],
      ['dark', [...base, ...dark]],
    ] as const) {
      expect({
        bg: resolve(tokens, '--color-bg'),
        text: resolve(tokens, '--color-text'),
      }).toEqual(ADMIN_COLORS[theme]);
    }
  });

  it.each([
    ['light', undefined, 'light'],
    ['light', 'payload-theme=dark', 'light'],
    ['dark', 'payload-theme=light', 'dark'],
    ['all', 'payload-theme=dark', 'dark'],
    ['all', 'payload-theme=light', 'light'],
    ['all', 'payload-theme=blue', 'auto'],
    ['all', 'payload-theme=Dark', 'auto'],
    ['all', undefined, 'auto'],
  ] as const)('admin.theme %s with cookie %s opens %s', (theme, cookie, expected) => {
    expect(adminTheme({ config: config({ theme }), headers: cookies(cookie) })).toBe(expected);
  });

  it("reads the theme cookie under the app's cookie prefix", () => {
    const app = config({ cookiePrefix: 'identity' });

    expect(adminTheme({ config: app, headers: cookies('identity-theme=dark') })).toBe('dark');
    expect(adminTheme({ config: app, headers: cookies('payload-theme=dark') })).toBe('auto');
  });

  it.each([
    ['users', '/admin', 'dark'],
    ['users', '/admin/', 'dark'],
    ['users', '/admin/collections/posts', 'dark'],
    ['users', '/admin?tab=1', 'dark'],
    ['users', '/admin#top', 'dark'],
    ['users', '/administrator', 'plain'],
    ['users', '/', 'plain'],
    ['users', '/rest/v1/users/me', 'plain'],
    ['customers', '/admin', 'plain'],
    ['customers', '/', 'plain'],
  ])('a %s sign-in to %s looks %s', (collectionSlug, returnTo, expected) => {
    expect(
      continueLook({
        config: config({ theme: 'dark' }),
        collectionSlug,
        returnTo,
        headers: cookies(),
      }),
    ).toBe(expected);
  });

  it('treats every path as the admin when the admin is at the root', () => {
    expect(
      continueLook({
        config: config({ theme: 'light', admin: '/' }),
        collectionSlug: 'users',
        returnTo: '/',
        headers: cookies(),
      }),
    ).toBe('light');
  });

  it.each(['light', 'dark', 'auto', 'plain'] as const)(
    'hashes the %s style into its CSP, with no script',
    (look) => {
      const { body, csp } = page(look);
      const style = /<style>([^<]*)<\/style>/.exec(body)![1];

      expect(body.match(/<style>/g)).toHaveLength(1);
      expect(csp).toBe(
        `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'sha256-${createHash('sha256').update(style).digest('base64')}'`,
      );
      expect(body).not.toMatch(/<script/i);
    },
  );

  it("paints each look's colours and hides the message for 1.5s", () => {
    expect(page('light').body).toContain(
      `html{color-scheme:light;background:${ADMIN_COLORS.light.bg};color:${ADMIN_COLORS.light.text}}`,
    );
    expect(page('dark').body).toContain(
      `html{color-scheme:dark;background:${ADMIN_COLORS.dark.bg};color:${ADMIN_COLORS.dark.text}}`,
    );
    expect(page('auto').body).toContain(
      `@media (prefers-color-scheme:dark){html{background:${ADMIN_COLORS.dark.bg};color:${ADMIN_COLORS.dark.text}}}`,
    );
    expect(page('plain').body).toContain('<style>html{color-scheme:light dark}body{');
    expect(page('plain').body).not.toContain(ADMIN_COLORS.light.bg);
    expect(page('light').body).toContain('visibility:hidden;animation:fb-show 0s 1.5s forwards');
  });

  it('escapes returnTo, lang and the labels', () => {
    const { body } = continuePage({
      returnTo: `/admin?a="<x>"&b='y'`,
      look: 'light',
      lang: '"><script>',
      loading: '<b>',
      next: '&',
    });

    expect(body).toContain(
      '<meta http-equiv="refresh" content="0;url=/admin?a=&#34;&#60;x&#62;&#34;&#38;b=&#39;y&#39;">',
    );
    expect(body).toContain('<a href="/admin?a=&#34;&#60;x&#62;&#34;&#38;b=&#39;y&#39;">&#38;</a>');
    expect(body).toContain('<html lang="&#34;&#62;&#60;script&#62;">');
    expect(body).toContain('<p>&#60;b&#62;…</p>');
    expect(body).not.toMatch(/<script/i);
  });
});
