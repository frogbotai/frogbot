import { expect, test } from '@playwright/test';

import { tasksSlug } from './fixtures/question/shared';

let consoleErrors: string[];

test.beforeEach(({ page }) => {
  consoleErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  page.on('pageerror', (error) => consoleErrors.push(error.message));
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

test('renders board actions right-aligned at their own width above the view controls', async ({
  page,
}) => {
  await page.goto(`/collections/${tasksSlug}/board`);

  const row = page.locator('.collection-view-shell__actions');
  const button = row.getByRole('button', { name: 'Board action' });

  await expect(button).toBeVisible();

  const rowBox = (await row.boundingBox())!;
  const buttonBox = (await button.boundingBox())!;

  expect(buttonBox.width).toBeLessThan(rowBox.width / 2);
  expect(Math.abs(buttonBox.x + buttonBox.width - (rowBox.x + rowBox.width))).toBeLessThanOrEqual(
    1,
  );
  expect(
    await row.evaluate(
      (element) =>
        element.compareDocumentPosition(document.querySelector('.list-controls')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  ).toBeTruthy();
});
