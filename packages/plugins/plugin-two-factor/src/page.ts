import { createHash } from 'node:crypto';

import type { FrogBotRequest } from 'frogbot';
import { parseCookies } from 'payload/shared';

import { noStore, payloadRequest, routes } from './context.js';

/** The `@frogbotai/ui` color roles the pages use, resolved per theme. A unit test keeps them equal to the design system's `figma.json`. */
export const ROLES = {
  light: {
    background: '#ffffff',
    foreground: '#090e1b',
    'muted-foreground': '#6a7084',
    muted: '#f5f6f9',
    primary: '#3acf6a',
    'primary-hover': '#5be084',
    'primary-pressed': '#2fb85c',
    'primary-foreground': '#04210d',
    border: '#d6dae2',
    input: '#b4b9c4',
    ring: '#166d30',
    brand: '#166d30',
    destructive: '#b91c1c',
  },
  dark: {
    background: '#090e1b',
    foreground: '#e6e9ef',
    'muted-foreground': '#8a8f99',
    muted: '#141a2a',
    primary: '#3acf6a',
    'primary-hover': '#5be084',
    'primary-pressed': '#2fb85c',
    'primary-foreground': '#04210d',
    border: '#202738',
    input: '#363e52',
    ring: '#3acf6a',
    brand: '#3acf6a',
    destructive: '#f87171',
  },
} as const;

type Theme = keyof typeof ROLES;

type Look = Theme | 'auto';

const roles = (theme: Theme) =>
  `:root { color-scheme: ${theme}; ${Object.entries(ROLES[theme])
    .map(([role, value]) => `--${role}: ${value};`)
    .join(' ')} }`;

const layout = `html { background: var(--background); color: var(--foreground); }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 400 14px/24px Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
main { box-sizing: border-box; width: min(24rem, 100vw); padding: 32px 16px; }
h1 { margin: 0 0 8px; font-size: 24px; line-height: 32px; font-weight: 600; letter-spacing: -0.01em; }
p { margin: 0 0 16px; }
.hint { color: var(--muted-foreground); }
form { display: grid; gap: 8px; margin: 0 0 16px; }
label { font-weight: 500; line-height: 20px; }
input { box-sizing: border-box; height: 32px; padding: 0 12px; border: 1px solid var(--input); border-radius: 12px; background: var(--background); color: inherit; font: inherit; outline: none; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); }
input:focus { border-color: var(--ring); box-shadow: 0 0 0 1px var(--ring); }
.button { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 32px; margin-top: 8px; padding: 0 16px; border: 0; border-radius: 9999px; background: var(--primary); color: var(--primary-foreground); font: inherit; font-weight: 700; line-height: 20px; text-decoration: none; cursor: pointer; }
.button:hover { background: var(--primary-hover); }
.button:active { background: var(--primary-pressed); }
.button:focus-visible, a:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
img { display: block; width: 192px; height: 192px; margin: 0 auto 16px; border-radius: 12px; image-rendering: pixelated; }
code, ol { font: 400 14px/22px "JetBrains Mono", ui-monospace, monospace; word-break: break-all; }
.box { margin: 0 0 16px; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--muted); }
ol { columns: 2; column-gap: 24px; padding-left: 28px; }
a { color: var(--brand); text-underline-offset: 2px; }
[role=alert] { color: var(--destructive); font-weight: 500; }`;

const styles = Object.fromEntries(
  (['light', 'dark', 'auto'] as const).map((look) => {
    const theme =
      look === 'auto'
        ? `${roles('light')}\n@media (prefers-color-scheme: dark) { ${roles('dark')} }`
        : roles(look);

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
  if (slug !== config.admin.user) return 'auto';
  if (config.admin.theme === 'light' || config.admin.theme === 'dark') return config.admin.theme;

  const cookie = parseCookies(req.headers).get(`${config.cookiePrefix || 'payload'}-theme`);

  return cookie === 'light' || cookie === 'dark' ? cookie : 'auto';
}

/** A server-rendered two-factor page in the admin's theme, with no script. */
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
  `<form method="post" action="${escapeHTML(action)}"><label for="code">${escapeHTML(label)}</label><input id="code" name="code" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" required autofocus><button class="button" type="submit">${escapeHTML(button)}</button></form>`;

const continueForm = (base: string) =>
  `<form method="post" action="${escapeHTML(`${base}/continue`)}"><button class="button" type="submit">I saved my codes</button></form>`;

export const codePageBody = ({ base, error }: { base: string; error?: string }) =>
  `<p class="hint">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>${alert(error)}${codeForm(`${base}/verify`, 'Code', 'Continue')}`;

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
  `<p class="hint">This account needs two-factor sign-in. Scan the QR code with an authenticator app, or enter the key, then type the 6-digit code it shows.</p><img src="${escapeHTML(qrCode)}" alt="QR code for your authenticator app"><p class="box">Key: <code>${escapeHTML(secret)}</code></p>${alert(error)}${codeForm(`${base}/setup`, 'Code', 'Turn on')}`;

export const recoveryCodesBody = ({ base, codes }: { base: string; codes: string[] }) =>
  `<p class="hint">Save these recovery codes somewhere safe. Each one signs you in once if you lose your authenticator. They won't be shown again.</p><ol class="box">${codes.map((code) => `<li>${escapeHTML(code)}</li>`).join('')}</ol><p><a download="recovery-codes.txt" href="data:text/plain;charset=utf-8,${encodeURIComponent(`${codes.join('\n')}\n`)}">Download codes</a></p>${continueForm(base)}`;

export const continueBody = ({ base }: { base: string }) =>
  `<p class="hint">Two-factor sign-in is on for this account.</p>${continueForm(base)}`;

/** Recovery codes left at or below which the page after a recovery-code sign-in links to making new ones. */
export const FEW_RECOVERY_CODES = 3;

export const recoveryCodesLeft = (left: number) =>
  left === 0
    ? 'No recovery codes left.'
    : `${left} recovery ${left === 1 ? 'code' : 'codes'} left.`;

/** The page after a recovery-code sign-in: how many codes remain and, when few do, where to make new ones. */
export const recoveryLeftBody = ({
  left,
  next,
  account,
}: {
  left: number;
  next: string;
  account?: string;
}) => {
  const few =
    left > FEW_RECOVERY_CODES
      ? ''
      : account
        ? `<p><a href="${escapeHTML(account)}">Make new recovery codes</a> so you can still sign in if you lose your authenticator.</p>`
        : '<p>Make new recovery codes from your account so you can still sign in if you lose your authenticator.</p>';

  return `<p class="hint">You signed in with a recovery code. It won't work again.</p><p>${recoveryCodesLeft(left)}</p>${few}<a class="button" href="${escapeHTML(next)}">Continue</a>`;
};

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
    body: `<p class="hint">This sign-in expired or was already used.</p><a class="button" href="${escapeHTML(signIn)}">Sign in</a>`,
    status: 400,
    headers,
  });
}
