import { test } from '@playwright/test';

// FrogBot CLI e2e map.
//
// v0 ships a single placeholder so the Playwright wiring is real: the
// config boots `pnpm -F frogbot-smoke dev` against port 3000 and waits
// for the dev server before any test runs. Promote this skipped test
// to a real `test(...)` once a browser-side flow worth asserting
// exists (admin panel, auth, etc.).

test.describe('frogbot CLI — dev server e2e', () => {
  test.skip('boots dev server and serves /api/users', () => {
    // TODO: hit `${baseURL}/api/users` via `page.request` and assert
    // the paginated empty payload shape. Skipped in v0.
  });
});
