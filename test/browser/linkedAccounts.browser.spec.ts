import { expect, type Page, test } from '@playwright/test';

import { setAdminTheme } from './__helpers/adminTheme';
import { themes, viewports } from './__helpers/viewShots';

let problems: string[];

test.beforeEach(async ({ page }) => {
  problems = [];

  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) {
      problems.push(`console: ${message.text()}`);
    }
  });

  page.on('pageerror', (error) => problems.push(`page: ${error.message}`));

  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') {
      problems.push(
        `request: ${request.method()} ${request.url()} ${request.failure()?.errorText}`,
      );
    }
  });

  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`response: ${response.status()} ${response.url()}`);
  });

  await page.route('https://www.gravatar.com/**', (route) => route.fulfill({ status: 204 }));
});

test.afterEach(() => {
  expect(problems).toEqual([]);
});

const group = (page: Page) => page.getByRole('region', { name: 'Linked' });

const row = (page: Page, name: string) =>
  group(page).locator('.frogbot-connections__row').filter({ hasText: name });

async function link(page: Page) {
  await expect(page.locator('.fb-nav-shell')).toHaveAttribute('data-nav-hydrated', 'true');
  await page.getByRole('button', { name: '+ New Connection' }).click();
  await page.getByRole('button', { name: /^Linked/ }).click();
  const callback = page.waitForResponse((response) => response.url().includes('/callback?'));
  await page.getByRole('button', { name: 'Continue with Linked' }).click();
  await callback;
  await page.waitForURL('/settings/connections');
}

async function menu(page: Page, name: string, item: string) {
  await page.getByRole('button', { name: `Options for ${name}` }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test('links two accounts of one piece, sets a default and disconnects one', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/settings/connections');
  await link(page);

  await expect(group(page).getByText('1 account')).toBeVisible();
  await expect(group(page).getByText('Default')).toHaveCount(0);

  await link(page);

  await expect(group(page).getByText('2 accounts')).toBeVisible();

  const [first, second] = await group(page)
    .locator('.frogbot-connections__row strong')
    .allTextContents();

  expect(first).not.toBe(second);
  await expect(row(page, first).getByText('Default')).toBeVisible();
  await expect(row(page, second).getByText('Default')).toHaveCount(0);

  for (const colorScheme of themes) {
    await setAdminTheme(page, colorScheme);
    await page.emulateMedia({ colorScheme });
    await page.goto('/settings/connections');
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(group(page).getByText('2 accounts')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      await page.screenshot({
        path: testInfo.outputPath(`linked-accounts-${colorScheme}-${viewport.width}.png`),
        animations: 'disabled',
      });
    }
  }

  await menu(page, second, 'Set as default');

  await expect(row(page, second).getByText('Default')).toBeVisible();
  await expect(row(page, first).getByText('Default')).toHaveCount(0);

  await page.reload();

  await expect(row(page, second).getByText('Default')).toBeVisible();

  await menu(page, second, 'Disconnect');

  await expect(group(page).getByText('1 account')).toBeVisible();
  await expect(row(page, first)).toBeVisible();
  await expect(row(page, second)).toHaveCount(0);

  await page.reload();

  await expect(row(page, first)).toBeVisible();
  await expect(row(page, second)).toHaveCount(0);
});
