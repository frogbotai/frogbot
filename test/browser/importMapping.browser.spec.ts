import { expect, test } from '@playwright/test';

let pageErrors: string[];

test.beforeEach(({ page }) => {
  pageErrors = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
});

test('maps a CSV column, previews the linked company, and imports the link', async ({ page }) => {
  const company = await page.request.post('/api/companies', { data: { name: 'Acme Corp' } });

  expect(company.status()).toBe(201);

  await page.goto('/admin/collections/imports/create');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'posts.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Post Title,Company\nMapped by name,Acme Corp\n'),
  });

  const titlePicker = page.getByRole('combobox', { name: 'Field for "Post Title"' });

  await expect(titlePicker).toHaveText('Skip');
  await expect(page.getByRole('combobox', { name: 'Field for "Company"' })).toHaveText('Company');
  await expect(page.getByRole('combobox', { name: 'Match "Company" by' })).toHaveText('Name');

  await titlePicker.click();
  await page.getByRole('option', { name: 'Title', exact: true }).click();

  await expect(titlePicker).toHaveText('Title');
  await expect(page.getByText('Acme Corp · linked')).toBeVisible();

  await page.getByRole('button', { name: 'Start Import' }).click();
  await page.waitForURL(/\/admin\/collections\/imports\/(?!create)[^/]+$/);

  await expect(page.getByText('Post Title → title')).toBeVisible();

  const run = await page.request.get('/api/payload-jobs/run');

  expect(run.ok()).toBe(true);

  const posts = await page.request.get('/api/posts?depth=0&where[title][equals]=Mapped by name');
  const [post] = ((await posts.json()) as { docs: { id: number | string }[] }).docs;

  expect(post).toMatchObject({ company: (await company.json()).doc.id });

  await page.goto(`/admin/collections/posts/${post.id}`);

  await expect(page.locator('#field-company')).toContainText('Acme Corp');
  expect(pageErrors).toEqual([]);
});
