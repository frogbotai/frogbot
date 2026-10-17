import { expect, type Page } from '@playwright/test';

export const composerInput = (page: Page) =>
  page.locator('.fb-composer').getByRole('textbox', { name: 'Message' });

export async function fillComposer(page: Page, text: string) {
  await composerInput(page).fill(text);
}

export async function expectComposerText(page: Page, text: string) {
  await expect(composerInput(page)).toHaveText(text);
}
