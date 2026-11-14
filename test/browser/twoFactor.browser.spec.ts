import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { Secret, TOTP } from 'otpauth';

import { registerFirstUser, user } from './__helpers/signIn';

const password = 'two-factor-browser-password';

let consoleErrors: string[];

const code = (secret: string, offset = 0) =>
  new TOTP({ secret: Secret.fromBase32(secret) }).generate({ timestamp: Date.now() + offset });

async function token(request: APIRequestContext, data: { email: string; password: string }) {
  const response = await request.post('/api/users/login', { data });
  const body = (await response.json()) as { token?: string };

  expect(body.token, `login for ${data.email}`).toEqual(expect.any(String));

  return { authorization: `JWT ${body.token}` };
}

async function createUser(request: APIRequestContext, email: string) {
  await registerFirstUser(request);

  const created = await request.post('/api/users', {
    data: { email, password },
    headers: await token(request, user),
  });

  expect(created.ok()).toBe(true);

  return ((await created.json()) as { doc: { id: string | number } }).doc.id;
}

async function turnOn(request: APIRequestContext, email: string) {
  const headers = await token(request, { email, password });
  const started = await request.post('/api/users/two-factor/enable/start', { headers });
  const { secret } = (await started.json()) as { secret: string };
  const enabled = await request.post('/api/users/two-factor/enable', {
    data: { code: code(secret) },
    headers,
  });

  expect(enabled.ok()).toBe(true);

  return secret;
}

async function submitPassword(page: Page, email: string, value = password) {
  const form = page.locator('form.login__form');

  await expect
    .poll(() =>
      form.evaluate((element) => Object.keys(element).some((key) => key.startsWith('__react'))),
    )
    .toBe(true);

  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(value);
  await form.locator('button[type="submit"]').click();
}

test.beforeEach(async ({ page }) => {
  consoleErrors = [];

  await page.route('https://www.gravatar.com/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  );

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  page.on('pageerror', (error) => consoleErrors.push(error.message));
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

test('signs in through the admin password form and the code page', async ({ page, request }) => {
  const email = `code-${Date.now()}@example.com`;

  await createUser(request, email);

  const secret = await turnOn(request, email);

  await page.goto('/login?redirect=%2Fcollections%2Fusers');
  await expect(page.locator('.login__brand')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue with Stub' })).toBeVisible();

  await submitPassword(page, email, 'not-the-password');
  await expect(page.getByText('The email or password provided is incorrect.')).toBeVisible();
  consoleErrors = consoleErrors.filter((message) => !message.includes('status of 401'));

  await submitPassword(page, email);
  await page.waitForURL((url) => url.pathname === '/api/users/two-factor');
  await expect(page.getByRole('heading')).toBeVisible();

  await page.getByLabel('Code').fill(code(secret, 30_000));
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL((url) => url.pathname === '/collections/users');
  await expect(page.locator('.fb-nav-shell')).toBeVisible();

  const me = await page.evaluate(async () => (await fetch('/api/users/me')).json());

  expect(me.user?.email).toBe(email);
});

test('turns two-factor sign-in on and off from the account section', async ({ page, request }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  const email = `account-${Date.now()}@example.com`;
  const id = await createUser(request, email);

  await page.goto('/login');
  await submitPassword(page, email);
  await page.waitForURL((url) => url.pathname === '/');

  await page.goto(`/collections/users/${id}`);

  const section = page.locator('section.two-factor');

  await expect(section.getByText('Off', { exact: true })).toBeVisible();
  await expect(section.getByText("API keys aren't affected")).toBeVisible();

  await section.getByRole('button', { name: 'Turn on' }).click();

  const dialog = page.getByRole('dialog');

  await expect(dialog.getByAltText('QR code for your authenticator app')).toBeVisible();

  const secret = (await dialog.locator('.two-factor__key').textContent())!;

  await dialog.getByLabel('6-digit code').fill(code(secret));
  await dialog.getByRole('button', { name: 'Turn on' }).click();

  const codes = dialog.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');

  await expect(codes).toHaveCount(10);

  const recovery = (await codes.first().textContent())!;

  await dialog.getByRole('button', { name: 'Copy' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(recovery);

  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(section.getByText('On', { exact: true })).toBeVisible();

  await section.getByRole('button', { name: 'Turn off' }).click();
  await dialog.getByLabel('Code or recovery code').fill(recovery);
  await dialog.getByRole('button', { name: 'Turn off' }).click();

  await expect(section.getByText('Off', { exact: true })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Turn on' })).toBeVisible();
});
