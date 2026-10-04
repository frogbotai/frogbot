import { test as base } from '@playwright/test';

import { registerFirstUser, signIn, type SignInOptions } from './__helpers/signIn';

const setup = base.extend<{ signInOptions: SignInOptions; authFile: string }>({
  signInOptions: [{}, { option: true }],
  authFile: ['', { option: true }],
});

setup('signs in to the admin', async ({ page, request, signInOptions, authFile }) => {
  setup.setTimeout(90_000);

  await registerFirstUser(request);
  await signIn(page, { ...signInOptions, timeout: 60_000 });
  await page.context().storageState({ path: authFile });
});
