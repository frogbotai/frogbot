import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { Endpoint, FrogBotRequest } from 'frogbot';

import { definitionFor, findForm, type FormsRuntime } from '../lookup.js';
import type { EmbedData } from './messages.js';

const ASSETS = {
  'form.js': 'text/javascript; charset=utf-8',
  'form.css': 'text/css; charset=utf-8',
} as const;

type AssetName = keyof typeof ASSETS;

type Assets = { files: Record<AssetName, Buffer>; version: string };

let loaded: Promise<Assets | undefined> | undefined;

const readAssets = async (): Promise<Assets> => {
  const entries = await Promise.all(
    (Object.keys(ASSETS) as AssetName[]).map(
      async (name) => [name, await readFile(new URL(`./assets/${name}`, import.meta.url))] as const,
    ),
  );

  const hash = createHash('sha256');

  for (const [, file] of entries) hash.update(file);

  return {
    files: Object.fromEntries(entries) as Record<AssetName, Buffer>,
    version: hash.digest('hex').slice(0, 16),
  };
};

const loadAssets = (req: FrogBotRequest) =>
  (loaded ??= readAssets().catch((error: unknown) => {
    loaded = undefined;

    req.frogbot.logger.error(
      { err: error },
      '[plugin-forms] Could not read the embed assets; run the plugin build',
    );

    return undefined;
  }));

const LOADER = `(() => {
  const script = document.currentScript;
  if (!script || !script.src) return;
  const src = new URL(script.src);
  src.pathname = src.pathname.replace(/\\.js$/, '');
  src.search = location.search;
  const frame = document.createElement('iframe');
  frame.src = src.href;
  frame.title = script.dataset.title || 'Form';
  frame.style.cssText = 'display:block;width:100%;height:480px;border:0';
  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow || event.origin !== src.origin) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'frogbot:form:height') {
      if (Number.isFinite(data.height) && data.height >= 0) frame.style.height = Math.ceil(data.height) + 'px';
      return;
    }
    if (data.type !== 'frogbot:form:submitted') return;
    const confirmation = data.confirmation;
    const submitted = new CustomEvent('frogbot:form-submitted', { bubbles: true, cancelable: true, detail: { confirmation } });
    if (!frame.dispatchEvent(submitted) || !confirmation || confirmation.type !== 'redirect') return;
    const url = new URL(String(confirmation.url), src);
    if (url.protocol === 'https:' || url.protocol === 'http:') location.assign(url.href);
  });
  const parent = script.parentElement;
  if (parent && parent !== document.head) parent.insertBefore(frame, script.nextSibling);
  else if (document.body) document.body.append(frame);
  else document.addEventListener('DOMContentLoaded', () => document.body.append(frame));
})();
`;

const HOSTNAME = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*$|^\[[0-9a-f:.]+\]$/;

const escapeHTML = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * Checks `frameAncestors` and returns it as the `frame-ancestors` source list. Only origins are
 * accepted, so nothing else can reach the header.
 */
export function resolveFrameAncestors(origins: string[] = []): string {
  for (const origin of origins) {
    const url = URL.canParse(origin) ? new URL(origin) : undefined;

    if (
      !url ||
      !['https:', 'http:'].includes(url.protocol) ||
      url.origin !== origin ||
      !HOSTNAME.test(url.hostname)
    ) {
      throw new Error(
        `[plugin-forms] frameAncestors takes origins like 'https://www.example.com', not '${origin}'.`,
      );
    }
  }

  return origins.length ? [...new Set(origins)].join(' ') : "'none'";
}

/**
 * The embed: `GET /api/forms/:slug/embed` is the form on a bare page that posts its height and
 * its confirmation to the page that frames it, and only the `frameAncestors` origins may frame it.
 * `GET /api/forms/:slug/embed.js` puts that page in an iframe where the script tag is.
 */
export function createEmbedEndpoints({
  runtime,
  frameAncestors,
  base,
}: {
  runtime: FormsRuntime;
  /** The `frame-ancestors` source list, from `resolveFrameAncestors`. */
  frameAncestors: string;
  /** The `forms` collection's API path, like `/api/forms`. */
  base: string;
}): Endpoint[] {
  const frameHeaders = {
    'Content-Security-Policy': `frame-ancestors ${frameAncestors}`,
    ...(frameAncestors === "'none'" ? { 'X-Frame-Options': 'DENY' } : {}),
    'X-Content-Type-Options': 'nosniff',
  };

  const page = (status: number, body: string) =>
    new Response(body, {
      status,
      headers: {
        ...frameHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });

  const notFound = () =>
    page(404, '<!doctype html><meta charset="utf-8"><title>Not found</title><p>Not found</p>');

  return [
    {
      method: 'get',
      path: '/:slug/embed',
      handler: async (req) => {
        const found = await findForm(req, runtime, req.routeParams?.slug);
        const assets = await loadAssets(req);

        if (!found || found.form.mode === 'update' || !assets) return notFound();

        const definition = await definitionFor(req, runtime, found);
        const formURL = `${base}/${encodeURIComponent(found.form.slug)}`;
        const data: EmbedData = {
          definition,
          submitUrl: `${formURL}/submit`,
          ...(definition.analytics ? { eventUrl: `${formURL}/events` } : {}),
        };

        const json = JSON.stringify(data).replace(/</g, '\\u003c');
        const asset = (name: AssetName) => `${base}/embed/${name}?v=${assets.version}`;

        return page(
          200,
          `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(data.definition.title)}</title>
<link rel="stylesheet" href="${asset('form.css')}">
<style>html, body { margin: 0; background: transparent; }</style>
<script type="module" src="${asset('form.js')}"></script>
</head>
<body>
<div id="fb-form" data-fb-ui></div>
<script type="application/json" id="fb-form-data">${json}</script>
</body>
</html>`,
        );
      },
    },
    {
      method: 'get',
      path: '/:slug/embed.js',
      handler: () =>
        new Response(LOADER, {
          headers: {
            'Content-Type': ASSETS['form.js'],
            'Cache-Control': 'public, max-age=300',
            'X-Content-Type-Options': 'nosniff',
          },
        }),
    },
    ...(Object.keys(ASSETS) as AssetName[]).map((name): Endpoint => ({
      method: 'get',
      path: `/embed/${name}`,
      handler: async (req) => {
        const assets = await loadAssets(req);

        if (!assets) return new Response('Not found', { status: 404 });

        const current = req.searchParams.get('v') === assets.version;

        return new Response(new Uint8Array(assets.files[name]), {
          headers: {
            'Content-Type': ASSETS[name],
            'Cache-Control': current
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=300',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      },
    })),
  ];
}
