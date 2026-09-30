import { expect, type Page } from '@playwright/test';

export async function expandSidebar(page: Page) {
  const shell = page.locator('.frogbot-nav-shell');

  if ((await shell.getAttribute('data-nav-state')) === 'desktop-nav-closed') {
    await page.click('button[aria-label="Open sidebar"]');
    await expect(shell).toHaveAttribute('data-nav-state', 'desktop-nav-open');
  }
}

export const collectionNavIcon = (page: Page, slug: string) =>
  page.locator(`#frogbot-nav-section-collections a[href="/collections/${slug}"] svg`);
