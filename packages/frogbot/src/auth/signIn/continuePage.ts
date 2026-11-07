import { createHash } from 'node:crypto';

import type { SanitizedConfig } from 'payload';
import { parseCookies } from 'payload/shared';

import type { FrogBotRequest } from '../../types/request.js';

/** Payload's admin `--color-bg` and `--color-text` for each theme. A unit test keeps them equal to Payload's tokens. */
export const ADMIN_COLORS = {
  light: { bg: '#ffffff', text: 'rgba(0, 0, 0, 0.9)' },
  dark: { bg: '#2c2c2c', text: '#ffffff' },
} as const;

/** How the sign-in continue page looks: an admin theme, the system's admin theme, or the browser's own colours. */
export type ContinueLook = 'light' | 'dark' | 'auto' | 'plain';

const colors = (theme: keyof typeof ADMIN_COLORS) =>
  `html { color-scheme: ${theme}; background: ${ADMIN_COLORS[theme].bg}; color: ${ADMIN_COLORS[theme].text}; }`;

const layout = `body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.5 system-ui, sans-serif; }
main { text-align: center; visibility: hidden; animation: fb-show 0s 1.5s forwards; }
p { margin: 0 0 0.5rem; }
a { color: inherit; }
@keyframes fb-show { to { visibility: visible; } }`;

const pageStyles = (look: ContinueLook) => {
  const theme = {
    light: colors('light'),
    dark: colors('dark'),
    auto: `${colors('light')}\n@media (prefers-color-scheme: dark) { ${colors('dark')} }`,
    plain: 'html { color-scheme: light dark; }',
  }[look];

  const css = `${theme}\n${layout}`;

  return {
    css,
    csp: `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'sha256-${createHash('sha256').update(css).digest('base64')}'`,
  };
};

const styles = {
  light: pageStyles('light'),
  dark: pageStyles('dark'),
  auto: pageStyles('auto'),
  plain: pageStyles('plain'),
};

const escapeHTML = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The theme the admin opens in, resolved in Payload's order: config, then the theme cookie, then the system. */
export function adminTheme({
  config,
  headers,
}: {
  config: Pick<SanitizedConfig, 'admin' | 'cookiePrefix'>;
  headers: Headers;
}): 'light' | 'dark' | 'auto' {
  if (config.admin.theme === 'light' || config.admin.theme === 'dark') return config.admin.theme;
  const cookie = parseCookies(headers).get(`${config.cookiePrefix || 'payload'}-theme`);

  return cookie === 'light' || cookie === 'dark' ? cookie : 'auto';
}

/** The look for a page that continues to `returnTo`: the admin's when it opens the admin, the browser's otherwise. */
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
    returnTo === (admin || '/') ||
    ['/', '?', '#'].some((next) => returnTo.startsWith(admin + next));

  return collectionSlug === config.admin.user && opensAdmin
    ? adminTheme({ config, headers })
    : 'plain';
}

/** The callback's answer: a page that continues to `returnTo` through a same-origin refresh, with nothing visible unless it takes over 1.5 seconds. */
export function continuePage({
  returnTo,
  look,
  lang,
  t,
  headers,
}: {
  returnTo: string;
  look: ContinueLook;
  lang: string;
  t: FrogBotRequest['t'];
  headers: Headers;
}): Response {
  const url = escapeHTML(returnTo);
  const loading = escapeHTML(`${t('general:loading').replace(/(?:\.{3}|…)$/, '')}…`);
  const { css, csp } = styles[look];

  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', csp);

  return new Response(
    `<!doctype html><html lang="${escapeHTML(lang)}"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${url}"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${loading}</title><style>${css}</style></head><body><main><p>${loading}</p><a href="${url}">${escapeHTML(t('general:next'))}</a></main></body></html>`,
    { headers },
  );
}
