import type { Page } from '@playwright/test';

/**
 * Deletes the signed-in user's saved setup and collapsed groups for a collection view, so a filter a test opened by
 * URL isn't restored for the specs that follow on the same server.
 */
export async function forgetViewSetup(page: Page, collectionSlug: string, viewSlug = 'list') {
  const key = `collection-${collectionSlug}-view-${viewSlug}`;

  await page.request.delete(`/api/payload-preferences/${key}`);
  await page.request.delete(`/api/payload-preferences/${key}:groups`);
}
