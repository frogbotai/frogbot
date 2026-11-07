import { createHash } from 'node:crypto';

import type { SanitizedConfig } from 'payload';
import { parseCookies } from 'payload/shared';

/** The admin's `--color-bg` and `--color-text` per theme, as Payload's tokens resolve them. */
export const ADMIN_COLORS = {
  light: { bg: '#ffffff', text: 'rgba(0, 0, 0, 0.9)' },
  dark: { bg: '#2c2c2c', text: '#ffffff' },
} as const;

/** How the sign-in continue page looks: one admin theme, the system's choice of the two, or the browser's own colours. */
export type ContinueLook = 'auto' | 'dark' | 'light' | 'plain';

const colors = ({ bg, text }: { bg: string; text: string }) => `background:${bg};color:${text}`;

const looks: Record<ContinueLook, string> = {
  light: `html{color-scheme:light;${colors(ADMIN_COLORS.light)}}`,
  dark: `html{color-scheme:dark;${colors(ADMIN_COLORS.dark)}}`,
  auto: `html{color-scheme:light dark;${colors(ADMIN_COLORS.light)}}@media (prefers-color-scheme:dark){html{${colors(ADMIN_COLORS.dark)}}}`,
  plain: 'html{color-scheme:light dark}',
};

const layout =
  'body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif}' +
  'main{text-align:center;visibility:hidden;animation:fb-show 0s 1.5s forwards}' +
  '@keyframes fb-show{to{visibility:visible}}p{margin:0 0 .75rem}a{color:inherit}';

const styles = Object.fromEntries(
  Object.entries(looks).map(([look, css]) => {
    const style = css + layout;
    const hash = createHash('sha256').update(style).digest('base64');

    return [
      look,
      {
        style,
        csp: `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'sha256-${hash}'`,
      },
    ];
  }),
) as Record<ContinueLook, { style: string; csp: string }>;

/** The theme the admin opens in, in Payload's order: config, then the theme cookie, then the system's (`auto`). */
export function adminTheme({
  config,
  headers,
}: {
  config: Pick<SanitizedConfig, 'admin' | 'cookiePrefix'>;
  headers: Headers;
}): 'auto' | 'dark' | 'light' {
  const { theme } = config.admin;
  if (theme === 'light' || theme === 'dark') return theme;

  const cookie = parseCookies(headers).get(`${config.cookiePrefix || 'payload'}-theme`);

  return cookie === 'light' || cookie === 'dark' ? cookie : 'auto';
}

/** The look for a sign-in that continues to `returnTo`: the admin's theme when it opens the admin, else the browser's colours. */
export function continueLook({
  config,
  collectionSlug,
  returnTo,
  headers,
}: {
  config: Pick<SanitizedConfig, 'admin' | 'cookiePrefix' | 'routes'>;
  collectionSlug: string;
  returnTo: string;
  headers: Headers;
}): ContinueLook {
  const admin = config.routes.admin.replace(/\/+$/, '');
  const opensAdmin =
    returnTo === config.routes.admin ||
    returnTo === admin ||
    ['/', '?', '#'].some((next) => returnTo.startsWith(admin + next));

  return collectionSlug === config.admin.user && opensAdmin
    ? adminTheme({ config, headers })
    : 'plain';
}

const escapeHTML = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The page a successful sign-in callback answers with: a same-origin refresh to `returnTo`, blank unless it takes over 1.5s. */
export function continuePage({
  returnTo,
  look,
  lang,
  loading,
  next,
}: {
  returnTo: string;
  look: ContinueLook;
  lang: string;
  loading: string;
  next: string;
}): { body: string; csp: string } {
  const url = escapeHTML(returnTo);
  const message = `${escapeHTML(loading)}…`;
  const { style, csp } = styles[look];

  return {
    body:
      `<!doctype html><html lang="${escapeHTML(lang)}"><head><meta charset="utf-8">` +
      `<meta http-equiv="refresh" content="0;url=${url}">` +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      `<title>${message}</title><style>${style}</style></head>` +
      `<body><main><p>${message}</p><a href="${url}">${escapeHTML(next)}</a></main></body></html>`,
    csp,
  };
}
