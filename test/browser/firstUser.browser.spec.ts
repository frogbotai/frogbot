import path from 'node:path';

import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';

import { user } from './__helpers/signIn';
import { firstUserEmail } from './fixtures/sign-in/shared';

const createFirstUserTitle = /Create First User/i;

const heading = (page: Page) => page.getByRole('heading', { name: 'Welcome' });
const emailInput = (page: Page) => page.locator('input[name="email"]');
const submit = (page: Page) => page.locator('.create-first-user button[type="submit"]');
const divider = (page: Page) => page.locator('.oauth-login-buttons__label', { hasText: 'or' });
const stubButton = (page: Page) => page.getByRole('link', { name: 'Continue with Stub' });

async function save(page: Page, testInfo: TestInfo, name: string) {
  const file = path.join(testInfo.project.outputDir, 'first-user', `${name}.png`);

  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

async function waitForHydrated(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith('__reactProps$')),
      ),
    )
    .toBe(true);
}

async function expectInOrder(locators: Locator[]) {
  const handles = await Promise.all(locators.map((locator) => locator.elementHandle()));

  for (let index = 1; index < handles.length; index++) {
    const following = await handles[index - 1].evaluate(
      (previous, next) =>
        Boolean(previous.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING),
      handles[index],
    );

    expect(following, `${String(locators[index - 1])} before ${String(locators[index])}`).toBe(
      true,
    );
  }
}

async function expectSignedInAdmin(page: Page) {
  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.locator('.fb-nav-shell')).toBeVisible();
  await waitForHydrated(page.locator('.fb-nav-shell'));
}

async function signInWithStub(page: Page) {
  const fetches: string[] = [];

  page.on('request', (request) => {
    if (request.url().includes('/sign-in/') && request.resourceType() !== 'document') {
      fetches.push(request.url());
    }
  });

  await waitForHydrated(stubButton(page));
  await stubButton(page).click();
  await expectSignedInAdmin(page);

  expect(fetches, 'the sign-in button navigates instead of fetching').toEqual([]);

  const me = await page.evaluate(async () => (await fetch('/api/users/me')).json());

  expect(me.user?.email).toBe(firstUserEmail);
}

test('@blank an app without sign-in methods keeps the plain first-user form', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.waitForURL((url) => url.pathname === '/create-first-user');

  await expect(heading(page)).toBeVisible();
  await expect(emailInput(page)).toBeVisible();
  await expect(page.locator('.oauth-login-buttons')).toHaveCount(0);
  await expect(page.getByText('Continue with')).toHaveCount(0);
  await expect(page).toHaveTitle(createFirstUserTitle);
  await save(page, testInfo, 'blank');

  await waitForHydrated(page.locator('.create-first-user form'));

  const formStateSettled = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/create-first-user',
  );

  await emailInput(page).fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('input[name="confirm-password"]').fill(user.password);
  await formStateSettled;
  await submit(page).click();
  await expectSignedInAdmin(page);
});

test('@passwords the first user can sign in with a method below the form', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.waitForURL((url) => url.pathname === '/create-first-user');

  await expectInOrder([
    heading(page),
    emailInput(page),
    submit(page),
    divider(page),
    stubButton(page),
  ]);

  await expect(stubButton(page)).toHaveAttribute('href', /returnTo=%2F$/);
  await expect(page).toHaveTitle(createFirstUserTitle);
  await save(page, testInfo, 'passwords');

  await signInWithStub(page);

  await page.goto('/create-first-user');
  await page.waitForURL((url) => url.pathname === '/');
});

test('@sign-in-only an app without passwords sends the first user to the login buttons', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.waitForURL((url) => url.pathname === '/login');

  await expect(stubButton(page)).toBeVisible();
  await expect(divider(page)).toHaveCount(0);
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  await save(page, testInfo, 'sign-in-only');

  await page.goto('/create-first-user');
  await page.waitForURL((url) => url.pathname === '/login');

  await signInWithStub(page);
});
