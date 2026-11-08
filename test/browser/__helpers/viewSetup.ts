import type { Page } from '@playwright/test';

/**
 * Deletes the signed-in user's saved setup for a collection view, so a filter a test opened by
 * URL isn't restored for the specs that follow on the same server.
 */
export async function forgetViewSetup(page: Page, collectionSlug: string, viewSlug = 'list') {
  await page.request.delete(
    `/api/payload-preferences/collection-${collectionSlug}-view-${viewSlug}`,
  );
}
