import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FormDefinition, FormDocument } from '@frogbotai/plugin-forms';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { leadsSlug } from './shared.js';

type EmbedData = { definition: FormDefinition; submitUrl: string; eventUrl?: string };

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';

const form: Omit<FormDocument, 'id'> = {
  title: 'Contact </script><script>alert(1)</script>',
  slug: 'contact',
  collection: leadsSlug,
  steps: [{ questions: [{ field: 'email' }] }],
  confirmation: { type: 'message', message: 'Thanks!' },
};

function embedData(html: string): EmbedData {
  const json = /<script type="application\/json" id="fb-form-data">(.*?)<\/script>/s.exec(html);

  if (!json) throw new Error('No embed data in the page');

  return JSON.parse(json[1]) as EmbedData;
}

describe(`forms embed [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;

  const get = (route: string) => fetch(new URL(route, booted.baseUrl));

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  async function createForm(overrides: Partial<FormDocument> = {}) {
    await booted.frogbot.create({
      collection: 'forms',
      data: { ...form, ...overrides },
      overrideAccess: true,
    });
  }

  it('serves the form on a bare page that no site may frame by default', async () => {
    await createForm();

    const response = await get('/api/forms/contact/embed');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('nav-shell');

    const data = embedData(html);

    expect(data.submitUrl).toBe('/api/forms/contact/submit');
    expect(data.eventUrl).toBeUndefined();
    expect(data.definition).toMatchObject({ slug: 'contact', title: form.title, closed: false });
  });

  it('links assets that load and cache by version', async () => {
    await createForm();

    const html = await (await get('/api/forms/contact/embed')).text();
    const links = [
      ...html.matchAll(/(?:href|src)="(\/api\/forms\/embed\/form\.(?:css|js)\?v=\w+)"/g),
    ];

    expect(links).toHaveLength(2);

    for (const [, link] of links) {
      const asset = await get(link);

      expect(asset.status).toBe(200);
      expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect((await asset.text()).length).toBeGreaterThan(1000);
    }

    expect((await get('/api/forms/embed/form.js')).headers.get('cache-control')).toBe(
      'public, max-age=300',
    );
  });

  it('answers 404 with the frame headers for unknown and edit-only forms', async () => {
    await createForm({ slug: 'edit-only', mode: 'update' });

    for (const slug of ['missing', 'edit-only']) {
      const response = await get(`/api/forms/${slug}/embed`);

      expect(response.status).toBe(404);
      expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    }
  });

  it('serves the script tag loader as JavaScript', async () => {
    const response = await get('/api/forms/contact/embed.js');
    const script = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(script).toContain("document.createElement('iframe')");
    expect(script).toContain('frogbot:form:height');
  });

  it('accepts a submit posted to the embed page submit URL', async () => {
    await createForm();

    const { submitUrl } = embedData(await (await get('/api/forms/contact/embed')).text());
    const { status, body } = await booted.restClient.post(submitUrl, {
      data: { email: 'embed@example.com' },
    });

    expect(status).toBe(200);
    expect(body).toEqual({ confirmation: { type: 'message', message: 'Thanks!' } });
  });
});
