import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import module, { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, mock, test } from 'node:test';

const require = createRequire(import.meta.url);
module.registerHooks = undefined;
const { register } = await import(
  require.resolve('tsx/esm/api', {
    paths: [dirname(require.resolve('frogbot'))],
  })
);
register();

const oauth = process.env.BUSINESS_QA_OAUTH !== 'off';
const databaseDir = await mkdtemp(join(tmpdir(), 'business-qa-wiring-'));
Object.assign(process.env, {
  NODE_ENV: 'development',
  FROGBOT_SECRET: 'business-qa-wiring-dummy-secret-at-least-32-characters',
  DATABASE_URL: `file:${join(databaseDir, 'fixture.db')}`,
  OPENAI_API_KEY: 'business-qa-dummy-openai',
  RESEND_API_KEY: 'business-qa-dummy-resend',
  GOOGLE_CLIENT_ID: oauth ? 'business-qa-dummy-google-client' : '',
  GOOGLE_CLIENT_SECRET: oauth ? 'business-qa-dummy-google-secret' : '',
  LINEAR_API_KEY: '',
});
const network = mock.method(globalThis, 'fetch', () => {
  throw new Error('Wiring verification must not call external providers.');
});
const { default: pendingConfig } = await import('../src/frogbot.config.ts');
const { qaAnalyst, releaseManager } = await import('../src/agents/index.ts');
const { Users } = await import('../src/collections/users.ts');
const { google, googleSheets, googleDrive, googleCalendar, linear } =
  await import('../src/pieces.ts');
const { getFrogBot } = await import('frogbot');
const config = await pendingConfig;
(await config._internal.payloadConfig).telemetry = false;
const products = [googleSheets, googleDrive, googleCalendar];
const scopes = {
  'google-sheets': [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive',
  ],
  'google-drive': ['https://www.googleapis.com/auth/drive'],
  'google-calendar': [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
  ],
};
const mounts = [
  {
    agent: qaAnalyst,
    count: 16,
    actions: [
      [googleSheets, 'findRows'],
      [googleSheets, 'getRows'],
      [googleDrive, 'downloadFile'],
      [googleDrive, 'getFile'],
      [googleDrive, 'listFiles'],
      [googleCalendar, 'listEvents'],
      [googleCalendar, 'findFreeBusyPeriods'],
      [googleCalendar, 'getEvent'],
    ],
  },
  {
    agent: releaseManager,
    count: 14,
    actions: [
      [googleSheets, 'appendRow'],
      [googleSheets, 'updateRow'],
      [googleDrive, 'createFolder'],
      [googleDrive, 'uploadFile'],
      [googleCalendar, 'createEvent'],
      [googleCalendar, 'updateEvent'],
    ],
  },
];
let frogbot;
let cookie;

async function request({ path, data, authenticated = false }) {
  return frogbot.handleRequest(
    new Request(`http://localhost:3000/api/${path}`, {
      method: data ? 'POST' : 'GET',
      headers: {
        ...(data ? { 'content-type': 'application/json' } : {}),
        ...(authenticated ? { cookie } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),
  );
}

before(async () => {
  frogbot = await getFrogBot({ config });
  const data = {
    email: 'business-qa-wiring@example.test',
    password: 'business-qa-dummy-password',
  };
  const registration = await request({ path: 'users/first-register', data });
  assert.equal(registration.status, 200, await registration.text());
  const login = await request({ path: 'users/login', data });
  assert.equal(login.status, 200, await login.text());
  cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie?.startsWith('frogbot-token='));
});

after(async () => {
  await frogbot?.destroy();
  await rm(databaseDir, { recursive: true, force: true });
  assert.equal(network.mock.callCount(), 0);
  mock.restoreAll();
});

test('native mounts preserve the limited read and write capabilities', () => {
  for (const { agent, count, actions } of mounts) {
    assert.equal(agent.tools.length, count);
    const native = agent.tools.slice(0, actions.length);
    assert.deepEqual(
      native,
      actions.map(([piece, action]) => piece[action]),
    );
    for (const action of native) assert.equal(typeof action, 'function');
    const tools = frogbot.agents[agent.slug].config.tools;
    assert.equal(tools.length, count);
    assert.deepEqual(
      tools
        .filter(({ slug }) => slug.startsWith('google-'))
        .map(({ slug }) => slug),
      actions.map(([piece, action]) => `${piece.slug}_${action}`),
    );
  }
  const append = frogbot.agents['release-manager'].config.tools[0];
  const input = append.inputSchema.parse({
    spreadsheetId: 'qa-sheet',
    sheetId: 0,
    values: ['ready'],
  });
  assert.equal('afterRow' in input, false);
  assert.match(
    qaAnalyst.instructions,
    /saved file references, not extracted text/,
  );
});

test('Google identity and per-product connections share only OAuth app credentials', () => {
  assert.deepEqual(Object.keys(config.connections.entries), [
    ...(oauth ? products.map(({ piece }) => piece) : []),
    'linear',
  ]);
  assert.deepEqual(Users.auth.signIn, oauth ? [google] : []);
  assert.equal(config.connections.entries.linear.piece, linear);
  assert.equal(config.connections.entries.linear.secret, true);
  for (const product of products) {
    assert.equal(product.oauth, google?.oauth);
    if (oauth) {
      assert.equal(config.connections.entries[product.piece].piece, product);
      assert.equal(config.connections.entries[product.piece].oauth, true);
      assert.equal(config.connections.entries[product.piece].secret, false);
    }
  }
});

test('password login and agent authorization preflight use the normal API', async () => {
  const me = await request({ path: 'users/me', authenticated: true });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, 'business-qa-wiring@example.test');
  const catalog = await request({ path: 'agents', authenticated: true });
  assert.deepEqual(
    (await catalog.json()).agents.map(({ slug }) => slug),
    ['qa-analyst', 'release-manager'],
  );
  for (const { agent } of mounts) {
    const path = `agents/${agent.slug}/authorizations`;
    assert.equal((await request({ path })).status, 401);
    const response = await request({ path, authenticated: true });
    assert.equal(response.status, 200);
    const { authorizations } = await response.json();
    assert.deepEqual(
      authorizations.map(({ piece }) => piece),
      [
        ...(oauth ? products.map(({ piece }) => piece) : []),
        ...(agent === releaseManager ? ['linear'] : []),
      ],
    );
    for (const authorization of authorizations.filter(({ oauth }) => oauth)) {
      assert.equal(
        authorization.authorizeUrl,
        `/api/connections/${authorization.piece}/authorize`,
      );
      assert.equal(authorization.secret, false);
      assert.deepEqual(
        authorization.scopes.filter(
          (scope) => scope !== 'openid' && !scope.includes('/userinfo.'),
        ),
        scopes[authorization.piece],
      );
    }
  }
});

test('all product authorize routes are accessible without executing a tool or following Google redirects', async () => {
  for (const { piece } of products) {
    const path = `connections/${piece}/authorize`;
    assert.equal((await request({ path })).status, oauth ? 401 : 404);
    const response = await request({ path, authenticated: true });
    assert.equal(response.status, oauth ? 302 : 404);
    if (!oauth) continue;
    const url = new URL(response.headers.get('location'));
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('client_id'), google.oauth.clientId);
    assert.equal(
      url.searchParams.get('redirect_uri'),
      `http://localhost:3000/api/connections/${piece}/callback`,
    );
    assert.deepEqual(
      url.searchParams
        .get('scope')
        .split(' ')
        .filter((scope) => scope !== 'openid' && !scope.includes('/userinfo.')),
      scopes[piece],
    );
  }
  const signIn = await request({ path: 'users/sign-in/google' });
  assert.equal(signIn.status, oauth ? 302 : 404);
  if (oauth) {
    const url = new URL(signIn.headers.get('location'));
    assert.equal(
      url.searchParams.get('redirect_uri'),
      'http://localhost:3000/api/users/sign-in/google/callback',
    );
    assert.deepEqual(url.searchParams.get('scope').split(' '), [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ]);
  }
  assert.equal(
    (
      await request({
        path: 'connections/google/authorize',
        authenticated: true,
      })
    ).status,
    404,
  );
  const connections = await request({
    path: 'connections',
    authenticated: true,
  });
  assert.equal(connections.status, 200);
  assert.deepEqual((await connections.json()).docs, []);
});
