import { expect, test } from '@playwright/test';

import { expandSidebar } from './__helpers/sidebar';
import { signIn, user } from './__helpers/signIn';

test.describe('account menu slots', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeAll(async ({ request }) => {
    const response = await request.get('/api/users/init');

    expect(response.ok()).toBe(true);

    const { initialized } = await response.json();

    if (!initialized) {
      const registration = await request.post('/api/users/first-register', { data: user });

      expect(registration.ok()).toBe(true);
    }
  });

  test('account menu renders custom items around Settings and replaces Log out', async ({
    page,
  }) => {
    await signIn(page);
    await expandSidebar(page);

    await page.getByRole('button', { name: 'Account' }).click();

    const menu = page.locator('.frogbot-account-menu');
    const items = menu.getByRole('menuitem');
    const probes = menu.getByTestId('account-menu-probe');

    await expect(items).toHaveText([
      /browser@example\.com/,
      'Before account',
      'Settings',
      'After account',
      'Sign out everywhere',
    ]);
    await expect(menu.getByRole('menuitem', { name: 'Log out' })).toHaveCount(0);
    await expect(probes).toHaveCount(3);

    expect(await probes.evaluateAll((nodes) => nodes.map((node) => node.dataset.frogbot))).toEqual([
      'attached',
      'attached',
      'attached',
    ]);
  });
});
