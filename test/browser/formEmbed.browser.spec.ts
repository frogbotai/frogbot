import { expect, test } from '@playwright/test';

import { signedOut } from './__helpers/signIn';
import { embedHost, leadsSlug, otherHost } from './fixtures/forms/shared';

test('a site on an allowed origin embeds a form with one script tag', async ({
  baseURL,
  browser,
  page,
}) => {
  const slug = `embed-${Date.now()}`;
  const email = `${slug}@example.com`;

  const created = await page.request.post('/api/forms', {
    data: {
      title: 'Embedded demo',
      slug,
      collection: leadsSlug,
      steps: [
        { title: 'About you', questions: [{ field: 'email', label: 'Email' }, { field: 'name' }] },
        { questions: [{ field: 'interest', label: 'What brings you here?' }] },
      ],
      hiddenParams: [{ name: 'utm_source', field: 'source' }],
      confirmation: { type: 'redirect', redirect: `${embedHost}/thanks` },
    },
  });

  expect(created.ok()).toBe(true);

  const visitor = await browser.newContext({
    storageState: signedOut,
    permissions: ['local-network-access'],
  });

  const host = await visitor.newPage();
  const errors: string[] = [];

  host.on('pageerror', (error) => errors.push(error.message));

  host.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await visitor.route(`${embedHost}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: new URL(route.request().url()).pathname.startsWith('/thanks')
        ? '<!doctype html><title>Thanks</title><h1>Thanks page</h1>'
        : `<!doctype html><title>Host</title><h1>Our site</h1>
<script src="${baseURL}/api/forms/${slug}/embed.js" data-title="Request a demo"></script>
<footer>Footer</footer>
<script>
  window.submitted = [];
  document.addEventListener('frogbot:form-submitted', (event) => window.submitted.push(event.detail.confirmation));
</script>`,
    }),
  );

  await host.goto(`${embedHost}/contact?utm_source=partner`);

  const iframe = host.locator('iframe[title="Request a demo"]');
  const form = host.frameLocator('iframe[title="Request a demo"]');

  await expect(host.locator('h1 + script + iframe + footer')).toHaveCount(1);
  await expect(form.getByRole('heading', { name: 'Embedded demo' })).toBeVisible();

  await expect.poll(async () => (await iframe.boundingBox())?.height).not.toBe(480);

  const firstHeight = (await iframe.boundingBox())?.height ?? 0;

  await form.getByRole('button', { name: 'Next' }).click();
  await expect(form.getByText('This field is required.')).toBeVisible();
  await expect.poll(async () => (await iframe.boundingBox())?.height).toBeGreaterThan(firstHeight);

  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Name').fill('Ada');
  await form.getByRole('button', { name: 'Next' }).click();
  await form.getByRole('radio', { name: 'sales' }).click();
  await form.getByRole('button', { name: 'Submit' }).click();

  await expect(host.getByRole('heading', { name: 'Thanks page' })).toBeVisible();
  expect(host.url()).toBe(`${embedHost}/thanks`);
  expect(errors).toEqual([]);

  await visitor.close();

  const leads = await page.request.get(
    `/api/${leadsSlug}?where[email][equals]=${encodeURIComponent(email)}&depth=0`,
  );

  const [lead] = (await leads.json()).docs as { source: string; interest: string }[];

  expect(lead).toMatchObject({ source: 'partner', interest: 'sales' });
});

test('a site that is not listed cannot frame the form', async ({ baseURL, browser, page }) => {
  const slug = `embed-blocked-${Date.now()}`;

  const created = await page.request.post('/api/forms', {
    data: {
      title: 'Not for framing',
      slug,
      collection: leadsSlug,
      steps: [{ questions: [{ field: 'email' }] }],
    },
  });

  expect(created.ok()).toBe(true);

  const visitor = await browser.newContext({
    storageState: signedOut,
    permissions: ['local-network-access'],
  });

  const host = await visitor.newPage();
  const refused = host.waitForEvent('console', (message) =>
    message.text().includes(`directive: "frame-ancestors ${embedHost}"`),
  );

  await visitor.route(`${otherHost}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><script src="${baseURL}/api/forms/${slug}/embed.js"></script>`,
    }),
  );

  await host.goto(`${otherHost}/`);

  expect((await refused).text()).toContain('The request has been blocked.');

  await expect(
    host.frameLocator('iframe').getByRole('heading', { name: 'Not for framing' }),
  ).toHaveCount(0);

  await visitor.close();
});
