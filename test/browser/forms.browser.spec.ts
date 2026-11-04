import { expect, type Page, test } from '@playwright/test';

import { signedOut } from './__helpers/signIn';
import { applicationsSlug, leadsSlug } from './fixtures/forms/shared';

async function waitForHydratedForm(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector('form.fb-form');

    return !!form && Object.keys(form).some((key) => key.startsWith('__reactProps$'));
  });
}

test('a signed-out visitor fills a two-step form and the record shows in the admin', async ({
  browser,
  page,
}) => {
  const slug = `demo-${Date.now()}`;
  const email = `${slug}@example.com`;

  const created = await page.request.post('/api/forms', {
    data: {
      title: 'Request a demo',
      slug,
      collection: leadsSlug,
      steps: [
        { title: 'About you', questions: [{ field: 'email', label: 'Email' }, { field: 'name' }] },
        { questions: [{ field: 'interest', label: 'What brings you here?' }] },
      ],
      hiddenParams: [{ name: 'utm_source', field: 'source' }],
      confirmation: { type: 'message', message: 'Thanks, we will be in touch.' },
    },
  });

  expect(created.ok()).toBe(true);

  const visitor = await browser.newContext({ storageState: signedOut });
  const form = await visitor.newPage();
  const errors: string[] = [];

  form.on('pageerror', (error) => errors.push(error.message));

  form.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await form.goto(`/forms/${slug}?utm_source=news`);
  await waitForHydratedForm(form);

  await expect(form.getByRole('heading', { name: 'Request a demo' })).toBeVisible();
  await expect(form.locator('.fb-nav-shell, .app-header')).toHaveCount(0);
  expect(new URL(form.url()).pathname).toBe(`/forms/${slug}`);

  await form.getByRole('button', { name: 'Next' }).click();

  await expect(form.getByText('This field is required.')).toBeVisible();
  await expect(form.getByText('Step 1 of 2')).toBeVisible();

  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Name').fill('Ada');
  await form.getByRole('button', { name: 'Next' }).click();

  await expect(form.getByText('Step 2 of 2')).toBeVisible();

  await form.getByRole('radio', { name: 'sales' }).click();
  await form.getByRole('button', { name: 'Submit' }).click();

  await expect(form.locator('.fb-form').getByRole('status')).toHaveText(
    'Thanks, we will be in touch.',
  );
  expect(errors).toEqual([]);

  await visitor.close();

  const leads = await page.request.get(
    `/api/${leadsSlug}?where[email][equals]=${encodeURIComponent(email)}&depth=0`,
  );

  const [lead] = (await leads.json()).docs as { id: number; source: string; interest: string }[];

  expect(lead).toMatchObject({ source: 'news', interest: 'sales' });

  await page.goto(`/collections/${leadsSlug}/${lead.id}`);

  await expect(page.locator('#field-email')).toHaveValue(email);
  await expect(page.locator('#field-source')).toHaveValue('news');
});

test('an unknown form shows visitors the not-found page', async ({ browser }) => {
  const visitor = await browser.newContext({ storageState: signedOut });
  const page = await visitor.newPage();

  for (const path of ['/forms/does-not-exist', '/forms']) {
    await page.goto(path);

    await expect(page.getByRole('heading', { name: 'Nothing found' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
  }

  await visitor.close();
});

test('an admin sends an edit link; signed out it opens prefilled and saves, and revoked it closes', async ({
  browser,
  page,
}) => {
  const slug = `update-${Date.now()}`;
  const email = `${slug}@example.com`;

  const form = await page.request.post('/api/forms', {
    data: {
      title: 'Update your application',
      slug,
      collection: applicationsSlug,
      mode: 'update',
      steps: [
        {
          questions: [
            { field: 'name', label: 'Name' },
            { field: 'phone', label: 'Phone' },
          ],
        },
      ],
      confirmation: { type: 'message', message: 'Your application is updated.' },
    },
  });

  expect(form.ok()).toBe(true);

  const created = await page.request.post(`/api/${applicationsSlug}`, {
    data: { email, name: 'Ada', phone: '555-0100' },
  });

  const { doc } = (await created.json()) as { doc: { id: number } };

  await page.goto(`/collections/${applicationsSlug}/${doc.id}`);
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Create edit link' }).click();

  const dialog = page.getByRole('dialog', { name: 'Create edit link' });

  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Create link' }).click();

  const field = dialog.getByLabel('Edit link');

  await expect(field).toHaveValue(/\/forms\/.+\?link=/);

  const url = await field.inputValue();

  expect(new URL(url).pathname).toBe(`/forms/${slug}`);
  await dialog.getByRole('button', { name: 'Done' }).click();

  const visitor = await browser.newContext({ storageState: signedOut });
  const editor = await visitor.newPage();
  const errors: string[] = [];

  editor.on('pageerror', (error) => errors.push(error.message));

  await editor.goto(url);
  await waitForHydratedForm(editor);

  await expect(editor.getByLabel('Name')).toHaveValue('Ada');
  await expect(editor.getByLabel('Phone')).toHaveValue('555-0100');
  await expect(editor.getByText(email)).toHaveCount(0);

  await editor.getByLabel('Phone').fill('555-0199');
  await editor.getByRole('button', { name: 'Submit' }).click();

  await expect(editor.locator('.fb-form').getByRole('status')).toHaveText(
    'Your application is updated.',
  );
  expect(errors).toEqual([]);

  await page.goto(`/collections/${applicationsSlug}/${doc.id}`);
  await expect(page.locator('#field-phone')).toHaveValue('555-0199');

  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'View edit links' }).click();

  const row = page.locator('tr', { has: page.locator('td.cell-status', { hasText: 'active' }) });

  await expect(row).toHaveCount(1);
  await row.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Revoke selected' }).click();

  await page
    .getByRole('dialog', { name: 'Revoke this link?' })
    .getByRole('button', { name: 'Revoke' })
    .click();

  await expect(page.locator('td.cell-status', { hasText: 'revoked' })).toHaveCount(1);

  await editor.goto(url);

  await expect(editor.getByRole('heading', { name: 'This link is no longer valid' })).toBeVisible();
  await expect(editor.locator('form.fb-form')).toHaveCount(0);

  await visitor.close();
});
