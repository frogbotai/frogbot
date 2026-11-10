import { createHash } from 'node:crypto';

import type { FrogBotRequest } from 'frogbot';
import { parseCookies } from 'payload/shared';

import { noStore, payloadRequest, routes } from './context.js';

const COLORS = {
  light: { bg: '#ffffff', text: 'rgba(0, 0, 0, 0.9)' },
  dark: { bg: '#2c2c2c', text: '#ffffff' },
} as const;

type Look = 'light' | 'dark' | 'auto' | 'plain';

const colors = (theme: keyof typeof COLORS) =>
  `html { color-scheme: ${theme}; background: ${COLORS[theme].bg}; color: ${COLORS[theme].text}; }`;

const layout = `body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.5 system-ui, sans-serif; }
main { width: min(22rem, calc(100vw - 2rem)); }
h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
p { margin: 0 0 1rem; }
form { display: grid; gap: 0.75rem; margin: 0 0 1rem; }
input, button { font: inherit; padding: 0.5rem 0.75rem; border-radius: 4px; border: 1px solid currentColor; background: transparent; color: inherit; }
button { cursor: pointer; }
img { display: block; width: 12rem; height: 12rem; margin: 0 auto 1rem; image-rendering: pixelated; }
code, ol { font-family: ui-monospace, monospace; word-break: break-all; }
ol { columns: 2; margin: 0 0 1rem; }
a { color: inherit; }
[role=alert] { font-weight: 600; }`;

const styles = Object.fromEntries(
  (['light', 'dark', 'auto', 'plain'] as const).map((look) => {
    const theme = {
      light: colors('light'),
      dark: colors('dark'),
      auto: `${colors('light')}\n@media (prefers-color-scheme: dark) { ${colors('dark')} }`,
      plain: 'html { color-scheme: light dark; }',
    }[look];

    const css = `${theme}\n${layout}`;
    const hash = createHash('sha256').update(css).digest('base64');

    return [
      look,
      {
        css,
        csp: `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; img-src data:; style-src 'sha256-${hash}'`,
      },
    ];
  }),
) as Record<Look, { css: string; csp: string }>;

export const escapeHTML = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function look(req: FrogBotRequest, slug: string): Look {
  const { config } = payloadRequest(req).payload;
  if (slug !== config.admin.user) return 'plain';
  if (config.admin.theme === 'light' || config.admin.theme === 'dark') return config.admin.theme;

  const cookie = parseCookies(req.headers).get(`${config.cookiePrefix || 'payload'}-theme`);

  return cookie === 'light' || cookie === 'dark' ? cookie : 'auto';
}

/** A server-rendered two-factor page in the admin's colours, with no script. */
export function renderPage({
  req,
  slug,
  title,
  body,
  status = 200,
  headers,
}: {
  req: FrogBotRequest;
  slug: string;
  title: string;
  body: string;
  status?: number;
  headers?: HeadersInit;
}): Response {
  const { css, csp } = styles[look(req, slug)];
  const answer = noStore(headers);

  answer.set('content-type', 'text/html; charset=utf-8');
  answer.set('referrer-policy', 'no-referrer');
  answer.set('x-content-type-options', 'nosniff');
  answer.set('content-security-policy', csp);

  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHTML(title)}</title><style>${css}</style></head><body><main><h1>${escapeHTML(title)}</h1>${body}</main></body></html>`,
    { status, headers: answer },
  );
}

const alert = (error?: string) => (error ? `<p role="alert">${escapeHTML(error)}</p>` : '');

const codeForm = (action: string, label: string, button: string) =>
  `<form method="post" action="${escapeHTML(action)}"><label for="code">${escapeHTML(label)}</label><input id="code" name="code" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" required autofocus><button type="submit">${escapeHTML(button)}</button></form>`;

const continueForm = (base: string) =>
  `<form method="post" action="${escapeHTML(`${base}/continue`)}"><button type="submit">I saved my codes</button></form>`;

export const codePageBody = ({ base, error }: { base: string; error?: string }) =>
  `<p>Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>${alert(error)}${codeForm(`${base}/verify`, 'Code', 'Continue')}`;

export const setupPageBody = ({
  base,
  qrCode,
  secret,
  error,
}: {
  base: string;
  qrCode: string;
  secret: string;
  error?: string;
}) =>
  `<p>This account needs two-factor sign-in. Scan the QR code with an authenticator app, or enter the key, then type the 6-digit code it shows.</p><img src="${escapeHTML(qrCode)}" alt="QR code for your authenticator app"><p>Key: <code>${escapeHTML(secret)}</code></p>${alert(error)}${codeForm(`${base}/setup`, 'Code', 'Turn on')}`;

export const recoveryCodesBody = ({ base, codes }: { base: string; codes: string[] }) =>
  `<p>Save these recovery codes somewhere safe. Each one signs you in once if you lose your authenticator. They won't be shown again.</p><ol>${codes.map((code) => `<li>${escapeHTML(code)}</li>`).join('')}</ol><p><a download="recovery-codes.txt" href="data:text/plain;charset=utf-8,${encodeURIComponent(`${codes.join('\n')}\n`)}">Download codes</a></p>${continueForm(base)}`;

export const continueBody = ({ base }: { base: string }) =>
  `<p>Two-factor sign-in is on for this account.</p>${continueForm(base)}`;

/** The page for a missing, expired or used pending sign-in. */
export function expiredPage(req: FrogBotRequest, slug: string, headers?: HeadersInit): Response {
  const { admin } = routes(req, slug);
  const { config } = payloadRequest(req).payload;
  const signIn =
    slug === config.admin.user ? `${admin.replace(/\/+$/, '')}${config.admin.routes.login}` : '/';

  return renderPage({
    req,
    slug,
    title: 'Sign in again',
    body: `<p>This sign-in expired or was already used.</p><p><a href="${escapeHTML(signIn)}">Sign in</a></p>`,
    status: 400,
    headers,
  });
}
