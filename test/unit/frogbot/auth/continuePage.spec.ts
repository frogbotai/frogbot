import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  ADMIN_COLORS,
  adminTheme,
  type ContinueLook,
  continueLook,
  continuePage,
} from '../../../../packages/frogbot/src/auth/signIn/continuePage.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';
import { readPayloadTokens } from '../../../../scripts/sync-payload-tokens.mjs';

const t = ((key: string) =>
  ({ 'general:loading': 'Loading', 'general:next': 'Next' })[key] ?? key) as FrogBotRequest['t'];

const config = (theme?: string, cookiePrefix?: string) =>
  ({
    admin: { user: 'users', theme },
    cookiePrefix,
    routes: { admin: '/admin' },
  }) as Parameters<typeof continueLook>[0]['config'];

const cookie = (value?: string) => new Headers(value ? { cookie: value } : {});

const render = async (look: ContinueLook, returnTo = '/admin', lang = 'en') => {
  const response = continuePage({ returnTo, look, lang, t, headers: new Headers() });

  return { response, body: await response.text() };
};

describe('sign-in continue page', () => {
  it("keeps ADMIN_COLORS equal to Payload's --color-bg and --color-text; update them after a Payload bump", () => {
    const tokens = readPayloadTokens();
    const resolve = (theme: 'light' | 'dark', name: string): string | undefined => {
      const value = new Map([...tokens.page, ...tokens[theme]]).get(name);
      const alias = /^var\((--[\w-]+)\)$/.exec(value ?? '')?.[1];

      return alias ? resolve(theme, alias) : value;
    };

    for (const theme of ['light', 'dark'] as const) {
      expect({ bg: resolve(theme, '--color-bg'), text: resolve(theme, '--color-text') }).toEqual(
        ADMIN_COLORS[theme],
      );
    }
  });

  it("resolves the admin's theme from config, then the theme cookie, then the system", () => {
    expect(adminTheme({ config: config('dark'), headers: cookie('payload-theme=light') })).toBe(
      'dark',
    );
    expect(adminTheme({ config: config('light'), headers: cookie('payload-theme=dark') })).toBe(
      'light',
    );
    expect(adminTheme({ config: config('all'), headers: cookie('payload-theme=dark') })).toBe(
      'dark',
    );
    expect(adminTheme({ config: config(), headers: cookie('a=1; payload-theme=light') })).toBe(
      'light',
    );
    expect(adminTheme({ config: config(), headers: cookie('payload-theme=junk') })).toBe('auto');
    expect(adminTheme({ config: config('all'), headers: cookie() })).toBe('auto');
    expect(
      adminTheme({ config: config('all', 'app'), headers: cookie('payload-theme=dark') }),
    ).toBe('auto');
    expect(adminTheme({ config: config('all', 'app'), headers: cookie('app-theme=dark') })).toBe(
      'dark',
    );
  });

  it('takes the admin look only when the admin collection continues into the admin', () => {
    const look = (returnTo: string, collectionSlug = 'users') =>
      continueLook({ config: config('dark'), collectionSlug, returnTo, headers: cookie() });

    expect(look('/admin')).toBe('dark');
    expect(look('/admin/collections/posts')).toBe('dark');
    expect(look('/admin?tab=1')).toBe('dark');
    expect(look('/administrator')).toBe('plain');
    expect(look('/')).toBe('plain');
    expect(look('/admin', 'customers')).toBe('plain');
    expect(
      continueLook({
        config: { ...config('light'), routes: { admin: '/' } } as Parameters<
          typeof continueLook
        >[0]['config'],
        collectionSlug: 'users',
        returnTo: '/',
        headers: cookie(),
      }),
    ).toBe('light');
  });

  it.each(['light', 'dark', 'auto', 'plain'] as const)(
    'serves the %s look under a CSP that allows only its own style, with no script',
    async (look) => {
      const { response, body } = await render(look);
      const css = /<style>([\s\S]*)<\/style>/.exec(body)![1];

      expect(response.headers.get('content-security-policy')).toBe(
        `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'sha256-${createHash('sha256').update(css).digest('base64')}'`,
      );
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(body).not.toMatch(/<script/i);
      expect(body.match(/<style>/g)).toHaveLength(1);
      expect(css).toContain('animation: fb-show 0s 1.5s forwards');
    },
  );

  it('paints the admin colours for each look, and the browser colours for plain', async () => {
    const light = `background: ${ADMIN_COLORS.light.bg}`;
    const dark = `background: ${ADMIN_COLORS.dark.bg}`;

    expect((await render('light')).body).toContain(light);
    expect((await render('light')).body).not.toContain(dark);
    expect((await render('dark')).body).toContain(dark);
    expect((await render('dark')).body).not.toContain(light);
    expect((await render('auto')).body).toMatch(
      new RegExp(
        `${light}[\\s\\S]*@media \\(prefers-color-scheme: dark\\) \\{ html \\{ color-scheme: dark; ${dark}`,
      ),
    );
    expect((await render('plain')).body).toContain('html { color-scheme: light dark; }');
    expect((await render('plain')).body).not.toContain('background:');
  });

  it('continues by refresh and link, translated, with every value escaped', async () => {
    const { body } = await render('light', `/admin?a="<x>"&b='y'`, 'en"><script>');
    const url = '/admin?a=&#34;&#60;x&#62;&#34;&#38;b=&#39;y&#39;';

    expect(body).toContain(`<meta http-equiv="refresh" content="0;url=${url}">`);
    expect(body).toContain(`<a href="${url}">Next</a>`);
    expect(body).toContain('<html lang="en&#34;&#62;&#60;script&#62;">');
    expect(body).toContain('<title>Loading…</title>');
    expect(body).toContain('<main><p>Loading…</p>');
  });
});
