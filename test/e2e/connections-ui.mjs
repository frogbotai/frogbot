import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '../..');
const businessQA = process.env.SMOKE_APP === 'business-qa';
const example = join(root, 'examples', businessQA ? 'business-qa' : 'simple');
const require = createRequire(join(example, 'package.json'));
const playwright = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(playwright);
const app = await mkdtemp(join(root, 'examples/.connections-ui-'));
const errors = [];
let browser;
let runtime;
let output = '';

const provider = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/authorize') {
    const callback = new URL(url.searchParams.get('redirect_uri'));
    callback.searchParams.set('state', url.searchParams.get('state'));
    callback.searchParams.set('code', 'local-code');
    response.writeHead(302, { location: callback.href }).end();
  } else if (url.pathname === '/token') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ access_token: 'local-access-token', token_type: 'Bearer' }));
  } else if (url.pathname === '/userinfo') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        sub: 'local-user',
        email: 'connections-ui@example.test',
        email_verified: true,
      }),
    );
  } else {
    response.writeHead(404).end();
  }
});

function run(args, env) {
  const child = spawn(process.execPath, args, { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  return child;
}

try {
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  const port = Number(process.env.SMOKE_PORT ?? 3116);
  const baseURL = `http://localhost:${port}`;
  const env = {
    ...process.env,
    DATABASE_URL: `file:${join(app, 'fixture.db')}`,
    SMOKE_PROVIDER_URL: `http://127.0.0.1:${provider.address().port}`,
    SMOKE_SERVER_URL: baseURL,
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_ENV: 'production',
    ...(businessQA
      ? {
          FROGBOT_SECRET: 'business-qa-smoke-local-secret-at-least-32-characters',
          GOOGLE_CLIENT_ID: 'business-qa-local-client',
          GOOGLE_CLIENT_SECRET: 'business-qa-local-secret',
          OPENAI_API_KEY: 'business-qa-local-openai',
          RESEND_API_KEY: 'business-qa-local-resend',
          LINEAR_API_KEY: '',
          PAYLOAD_TELEMETRY_DISABLED: '1',
          NODE_OPTIONS: `--import=${join(import.meta.dirname, 'fixtures/business-qa-network.mjs')}`,
        }
      : {}),
  };
  await cp(join(example, 'src'), join(app, 'src'), { recursive: true });
  await cp(join(example, 'package.json'), join(app, 'package.json'));
  await cp(join(example, 'tsconfig.json'), join(app, 'tsconfig.json'));
  await symlink(join(example, 'node_modules'), join(app, 'node_modules'));
  if (!businessQA) {
    await cp(
      join(import.meta.dirname, 'fixtures/connections-ui.config.ts'),
      join(app, 'src/frogbot.config.ts'),
    );
  }
  await writeFile(
    join(app, 'next.config.mjs'),
    `import { withFrogbot } from '@frogbotai/next/config';
export default withFrogbot({ eslint: { ignoreDuringBuilds: true }, typescript: { ignoreBuildErrors: true } });
`,
  );

  const generated = run([join(root, 'packages/frogbot/bin.js'), 'generate:importmap'], env);
  assert.equal((await once(generated, 'exit'))[0], 0, output);
  const seed = run(
    [
      '--input-type=module',
      '-e',
      `
    import module, { createRequire } from 'node:module';
    import { dirname } from 'node:path';
    import { getFrogbot } from 'frogbot';
    module.registerHooks = undefined;
    const require = createRequire(import.meta.url);
    const { register } = await import(require.resolve('tsx/esm/api', { paths: [dirname(require.resolve('frogbot'))] }));
    register();
    const { default: config } = await import('./src/frogbot.config.ts');
    const frogbot = await getFrogbot({ config });
    await frogbot.create({ collection: 'users', data: { email: 'connections-ui@example.test', password: crypto.randomUUID() } });
    await frogbot.destroy();
    process.exit(0);
  `,
    ],
    { ...env, NODE_ENV: 'development' },
  );
  assert.equal((await once(seed, 'exit'))[0], 0, output);
  const build = run([require.resolve('next/dist/bin/next'), 'build', '--no-lint'], env);
  assert.equal((await once(build, 'exit'))[0], 0, output);
  console.log(
    `PASS production ${businessQA ? 'business-qa' : 'simple'} app using built workspace packages`,
  );
  runtime = run([require.resolve('next/dist/bin/next'), 'start', '--port', String(port)], env);
  for (let attempt = 0; attempt < 120; attempt++) {
    if (runtime.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(`${baseURL}/login`)).ok) break;
    } catch (error) {
      if (attempt === 119) throw error;
    }
    await delay(500);
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  if (businessQA) {
    await page.route('**/api/users/sign-in/google?*', async (route) => {
      const response = await route.fetch({ maxRedirects: 0 });
      assert.equal(response.status(), 302);
      const url = new URL(response.headers().location);
      assert.equal(url.origin, 'https://accounts.google.com');
      return route.fulfill({
        response,
        headers: {
          ...response.headers(),
          location: `${env.SMOKE_PROVIDER_URL}/authorize${url.search}`,
        },
      });
    });
  }
  await page.goto(`${baseURL}/login`);
  const google = page.getByRole('link', { name: 'Continue with Google' });
  await google.waitFor({ state: 'visible' });
  assert.equal(await google.getAttribute('href'), '/api/users/sign-in/google?returnTo=%2F');
  assert.equal(await page.getByRole('button', { name: 'Login', exact: true }).count(), 1);
  console.log('PASS /login: password form + visible Google sign-in link');
  const callback = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/google/callback'),
  );
  await google.click();
  const callbackResponse = await callback;
  assert.equal(
    callbackResponse.status(),
    302,
    callbackResponse.status() === 302 ? undefined : await callbackResponse.text(),
  );
  await page.waitForURL(baseURL + '/', { timeout: 30000 });
  const identity = await page.evaluate(async () => (await fetch('/api/users/me')).json());
  assert.equal(
    identity.user?.email,
    'connections-ui@example.test',
    JSON.stringify({
      identity,
      url: page.url(),
      cookies: (await page.context().cookies()).map(({ name, path, sameSite, secure }) => ({
        name,
        path,
        sameSite,
        secure,
      })),
      errors,
    }),
  );
  const before = await page.evaluate(async () => (await fetch('/api/connections?limit=0')).json());
  assert.equal(before.docs.length, 0);
  console.log('PASS local OAuth sign-in: authenticated session, zero linked accounts');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Linked accounts', exact: true }).click();
  await page.getByText('No connections yet', { exact: true }).waitFor();
  if (businessQA) {
    assert.deepEqual(errors, []);
    console.log(
      'PASS business-qa normal sign-in callback → session → Linked accounts empty; local provider only',
    );
  } else {
    await page.getByRole('button', { name: '+ New Connection', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Select integration' }).waitFor();
    await dialog.getByRole('textbox', { name: 'Search integrations' }).fill('missing');
    await dialog.getByText('No integrations found', { exact: true }).waitFor();
    await dialog.getByRole('textbox', { name: 'Search integrations' }).fill('local');
    assert.equal(await dialog.getByRole('button', { name: /Google/ }).count(), 0);
    await dialog.getByRole('button', { name: /Local Fixture/ }).click();
    await dialog.getByRole('heading', { name: 'Connect to Local Fixture' }).waitFor();
    assert.equal(
      await dialog.getByLabel('apiKey', { exact: true }).getAttribute('type'),
      'password',
    );
    await dialog.getByLabel('apiKey', { exact: true }).fill('local-fixture-key');
    await dialog.getByRole('combobox', { name: 'region', exact: true }).click();
    await page.getByRole('option', { name: 'west', exact: true }).click();
    await dialog.getByLabel('retries', { exact: true }).fill('3');
    await dialog.getByRole('checkbox', { name: 'enabled', exact: true }).check();
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/connections/local-fixture') &&
        response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    const response = await created;
    assert.equal(response.status(), 200);
    assert.deepEqual(response.request().postDataJSON(), {
      apiKey: 'local-fixture-key',
      region: 'west',
      retries: 3,
      enabled: true,
    });
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Options for Local Fixture' }).waitFor();
    console.log(
      'PASS Settings → Linked accounts → searchable modal → masked static fields → POST 200',
    );
    await page.reload();
    await page.getByRole('button', { name: 'Options for Local Fixture' }).waitFor();
    const data = await page.evaluate(async () => (await fetch('/api/connections?limit=0')).json());
    assert.equal(data.docs.length, 1);
    assert.equal(data.docs[0].status, 'active');
    assert.equal(JSON.stringify(data).includes('local-fixture-key'), false);
    await page.getByRole('textbox', { name: 'Search connections' }).fill('missing');
    await page.getByText('No connections match your search').waitFor();
    await page.getByRole('textbox', { name: 'Search connections' }).fill('local');
    await page.getByRole('button', { name: 'Options for Local Fixture' }).click();
    const deleted = page.waitForResponse((response) => response.request().method() === 'DELETE');
    await page.getByRole('menuitem', { name: 'Disconnect', exact: true }).click();
    assert.equal((await deleted).status(), 204);
    await page.getByRole('textbox', { name: 'Search connections' }).fill('');
    await page.getByText('No connections yet', { exact: true }).waitFor();
    await page.reload();
    await page.getByText('No connections yet', { exact: true }).waitFor();
    const after = await page.evaluate(async () => (await fetch('/api/connections?limit=0')).json());
    assert.equal(after.docs.length, 0);
    assert.deepEqual(errors, []);
    console.log(
      'PASS persisted row + search + Disconnect DELETE 204 + reload empty; zero browser exceptions',
    );
  }
} catch (error) {
  console.error(output);
  throw error;
} finally {
  await browser?.close();
  if (runtime && runtime.exitCode === null) {
    runtime.kill('SIGTERM');
    await once(runtime, 'exit');
  }
  provider.close();
  await rm(app, { recursive: true, force: true });
}
