import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

test('the upload dropzone labels its paste button "Paste link"', async ({ page }) => {
  await page.goto('/collections/files/create');

  const paste = page.getByRole('button', { name: 'Paste link' });

  await expect(paste).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select a file' })).toBeVisible();

  const label = await paste.evaluate((button) => {
    const box = button.getBoundingClientRect();

    return {
      text: getComputedStyle(button, '::before').content,
      wide: box.width > box.height * 2,
    };
  });

  expect(label).toEqual({ text: '"Paste link"', wide: true });
});
