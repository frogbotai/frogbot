import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import { runShare } from '../../../../packages/plugins/plugin-dojo/src/cli/run.js';
import { keyFingerprint, sealKeys } from '../../../../packages/plugins/plugin-dojo/src/cli/seal.js';
import { fingerprint, openKeys, startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeApp } from './helpers.js';

const stripe = 'sk_test_aaaa4242';
const openai = 'sk-proj-abcdx7Qa';
const airtable = 'patXYZ1234a91b';

const bringing = '[frogbot] Bringing 2 keys: STRIPE_KEY ••••4242, OPENAI_API_KEY ••••x7Qa';
const noTerminal =
  '[frogbot] No terminal: carrying all keys. Use --no-keys or --skip-key NAME to leave some out.';

async function setup() {
  const root = await tempDir();
  const dojo = await startFakeDojo();
  const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url };

  await writeApp(root, { '.env': `STRIPE_KEY=${stripe}\nOPENAI_API_KEY=${openai}\n` });
  dojo.tokens.set('fb_stored', 100);
  await writeToken(env, dojo.url, 'fb_stored');

  const run = async (
    args: string[],
    options: Omit<Parameters<typeof testIO>[0], 'cwd' | 'env'> = {},
  ) => {
    const io = testIO({ cwd: root, env, ...options });

    return { code: await runShare(args, io.io), ...io };
  };

  const writeEnv = (text: string) => writeFile(join(root, '.env'), text);

  return { root, dojo, run, writeEnv };
}

describe('seal', () => {
  const values = { STRIPE_KEY: stripe, OPENAI_API_KEY: openai };

  it("opens with Dojo's private key to the exact values, and not with another", () => {
    const dojoKey = generateKeyPairSync('x25519');
    const publicKey = dojoKey.publicKey.export({ format: 'jwk' }).x ?? '';
    const sealed = sealKeys(values, { keyId: 'seal-1', publicKey });

    expect(sealed.keyId).toBe('seal-1');
    expect(openKeys(sealed, dojoKey.privateKey)).toEqual(values);
    expect(() => openKeys(sealed, generateKeyPairSync('x25519').privateKey)).toThrow();
    expect(JSON.stringify(sealed)).not.toContain(stripe);
  });

  it('fingerprints a key as 307 stores it, salted per app', () => {
    const salt = randomBytes(32).toString('base64url');
    const other = randomBytes(32).toString('base64url');

    expect(keyFingerprint(salt, 1, 'STRIPE_KEY', stripe)).toBe(
      fingerprint(salt, 1, 'STRIPE_KEY', stripe),
    );
    expect(keyFingerprint(salt, 1, 'STRIPE_KEY', stripe)).not.toBe(
      keyFingerprint(other, 1, 'STRIPE_KEY', stripe),
    );
    expect(keyFingerprint(salt, '1', 'STRIPE_KEY', stripe)).not.toBe(
      keyFingerprint(salt, '2', 'STRIPE_KEY', stripe),
    );
  });

  it('sends and prints no plain value', async () => {
    const { dojo, run } = await setup();
    const result = await run(['--no-data']);

    expect(result.code).toBe(0);
    expect(dojo.opened).toEqual([{ values, updateKeys: false }]);

    for (const value of [stripe, openai]) {
      for (const request of dojo.requests) {
        expect(request.body.toString('latin1')).not.toContain(value);
      }

      expect([...result.stdout(), ...result.stderr()].join('\n')).not.toContain(value);
    }
  });
});

describe('frogbot share: keys on a first share', () => {
  it('carries every key with no TTY, without asking, and says so', async () => {
    const { dojo, run } = await setup();
    const result = await run(['--no-data']);

    expect(result.code).toBe(0);
    expect(result.asked).toEqual([]);
    expect(result.stdout().slice(0, 3)).toEqual([
      bringing,
      noTerminal,
      '[frogbot] Created deals-app in Trend Capital, linked in .frogbot/app.json.',
    ]);
    expect(dojo.opened.map((opened) => opened.values)).toEqual([
      { STRIPE_KEY: stripe, OPENAI_API_KEY: openai },
    ]);
    expect(dojo.keys.get(1)).toEqual({ STRIPE_KEY: stripe, OPENAI_API_KEY: openai });
  });

  it('sends no keys part with --no-keys', async () => {
    const { dojo, run } = await setup();
    const result = await run(['--no-data', '--no-keys']);

    expect(result.code).toBe(0);
    expect(result.stdout().join('\n')).not.toContain('key');
    expect(dojo.paths()).not.toContain('GET /api/cli/sealing-key');

    const upload = dojo.requests.find((request) => request.path === '/api/apps/1/deployments');

    expect(upload?.form?.has('keys')).toBe(false);
  });

  it('leaves out each --skip-key', async () => {
    const { dojo, run } = await setup();
    const result = await run(['--no-data', '--skip-key', 'STRIPE_KEY']);

    expect(result.code).toBe(0);
    expect(result.stdout()[0]).toBe('[frogbot] Bringing 1 key: OPENAI_API_KEY ••••x7Qa');
    expect(dojo.opened.map((opened) => opened.values)).toEqual([{ OPENAI_API_KEY: openai }]);

    const both = await setup();

    expect(
      (await both.run(['--no-data', '--skip-key', 'STRIPE_KEY', '--skip-key', 'OPENAI_API_KEY']))
        .code,
    ).toBe(0);
    expect(both.dojo.opened).toEqual([]);
  });

  it('stops with exit 2 before any request on a --skip-key that names no key', async () => {
    const { dojo, run } = await setup();
    const result = await run(['--no-data', '--skip-key', 'stripe_key']);

    expect(result.code).toBe(2);
    expect(result.stderr()).toEqual([
      '[frogbot] No key named stripe_key; keys are: STRIPE_KEY, OPENAI_API_KEY.',
    ]);
    expect(dojo.requests).toEqual([]);
  });

  it('sends and prints no short, multi-line or Dojo-provided value', async () => {
    const { dojo, run, writeEnv } = await setup();
    const hidden = ['abc12', 'line2SECRET', 'DBPASSWORD', 'FROGBOTSECRETVALUE123'];

    await writeEnv(
      `SHORT=abc12\nMULTI="line1\nline2SECRET"\nDATABASE_URL=postgres://u:DBPASSWORD@h/x\nFROGBOT_SECRET=FROGBOTSECRETVALUE123\n`,
    );

    const result = await run(['--no-data']);

    expect(result.code).toBe(0);
    expect(result.stdout()[0]).toBe('[frogbot] Bringing 2 keys: SHORT ••••, MULTI ••••CRET');
    expect(dojo.opened.map((opened) => opened.values)).toEqual([
      { SHORT: 'abc12', MULTI: 'line1\nline2SECRET' },
    ]);

    for (const value of hidden) {
      expect([...result.stdout(), ...result.stderr()].join('\n')).not.toContain(value);

      for (const request of dojo.requests) {
        expect(request.body.toString('latin1')).not.toContain(value);
      }
    }
  });

  it('sends only the keys left ticked with a TTY', async () => {
    const { dojo, run } = await setup();
    const result = await run(['--no-data'], { isTTY: true, multiselect: ['OPENAI_API_KEY'] });

    expect(result.code).toBe(0);
    expect(result.asked).toEqual(['Keys to bring (untick any to leave out)']);
    expect(result.stdout()[0]).toBe('[frogbot] Bringing 1 key: OPENAI_API_KEY ••••x7Qa');
    expect(result.stdout()).not.toContain(noTerminal);
    expect(dojo.opened.map((opened) => opened.values)).toEqual([{ OPENAI_API_KEY: openai }]);
  });

  it('sends none when every key is unticked', async () => {
    const { dojo, run } = await setup();
    const result = await run(['--no-data'], { isTTY: true, multiselect: [] });

    expect(result.code).toBe(0);
    expect(dojo.opened).toEqual([]);
    expect(dojo.paths()).not.toContain('GET /api/cli/sealing-key');
  });

  it('skips the list with --yes', async () => {
    const { dojo, run } = await setup();
    const result = await run(['--no-data', '--yes'], { isTTY: true });

    expect(result.code).toBe(0);
    expect(result.asked).toEqual([]);
    expect(result.stdout()[0]).toBe(bringing);
    expect(dojo.opened).toHaveLength(1);
  });
});

describe('frogbot share: keys on a later share', () => {
  const later = async () => {
    const shared = await setup();

    expect((await shared.run(['--no-data'])).code).toBe(0);

    await shared.writeEnv(
      `STRIPE_KEY=sk_live_bbbb9999\nOPENAI_API_KEY=${openai}\nAIRTABLE_KEY=${airtable}\n`,
    );

    return shared;
  };

  it('adds new keys and keeps changed ones live', async () => {
    const { dojo, run } = await later();
    const result = await run([], { isTTY: true });

    expect(result.code).toBe(0);
    expect(result.asked).toEqual([]);
    expect(result.stdout().slice(0, 2)).toEqual([
      '[frogbot] Adding 1 new key: AIRTABLE_KEY ••••a91b',
      '[frogbot] 1 key differs from live, kept live: STRIPE_KEY. Use --update-keys to send local values.',
    ]);
    expect(dojo.opened.at(-1)).toEqual({ values: { AIRTABLE_KEY: airtable }, updateKeys: false });
    expect(dojo.keys.get(1)).toEqual({
      STRIPE_KEY: stripe,
      OPENAI_API_KEY: openai,
      AIRTABLE_KEY: airtable,
    });
  });

  it('sends changed keys with --update-keys', async () => {
    const { dojo, run } = await later();
    const result = await run(['--update-keys']);

    expect(result.code).toBe(0);
    expect(result.stdout().slice(0, 2)).toEqual([
      '[frogbot] Adding 1 new key: AIRTABLE_KEY ••••a91b',
      '[frogbot] Updating 1 key: STRIPE_KEY ••••9999',
    ]);
    expect(dojo.opened.at(-1)).toEqual({
      values: { AIRTABLE_KEY: airtable, STRIPE_KEY: 'sk_live_bbbb9999' },
      updateKeys: true,
    });
    expect(dojo.keys.get(1)?.STRIPE_KEY).toBe('sk_live_bbbb9999');
  });

  it('never removes a key missing locally, and sends nothing when nothing is new', async () => {
    const { dojo, run, writeEnv } = await setup();

    expect((await run(['--no-data'])).code).toBe(0);

    await writeEnv(`STRIPE_KEY=${stripe}\n`);

    const result = await run([]);

    expect(result.code).toBe(0);
    expect(result.stdout().join('\n')).not.toContain('key');
    expect(dojo.opened).toHaveLength(1);
    expect(dojo.paths().filter((path) => path === 'GET /api/cli/sealing-key')).toHaveLength(1);
    expect(dojo.keys.get(1)).toEqual({ STRIPE_KEY: stripe, OPENAI_API_KEY: openai });
  });

  it('honours --skip-key and --no-keys, without reading the live keys for --no-keys', async () => {
    const skipped = await later();
    const result = await skipped.run(['--skip-key', 'AIRTABLE_KEY']);

    expect(result.code).toBe(0);
    expect(result.stdout().join('\n')).not.toContain('AIRTABLE_KEY');
    expect(skipped.dojo.opened).toHaveLength(1);

    const none = await later();

    expect((await none.run(['--no-keys'])).code).toBe(0);
    expect(none.dojo.paths().filter((path) => path === 'GET /api/apps/1/keys')).toEqual([]);
    expect(none.dojo.opened).toHaveLength(1);
  });

  it("compares against the app's own salt, which differs between apps", async () => {
    const first = await later();
    const second = await later();
    const result = await first.run([]);
    const salt = first.dojo.salts.get(1) ?? '';

    expect((await second.run([])).code).toBe(0);
    expect(result.code).toBe(0);
    expect(Buffer.from(salt, 'base64url')).toHaveLength(32);
    expect(second.dojo.salts.get(1)).toHaveLength(salt.length);
    expect(salt).not.toBe(second.dojo.salts.get(1));
    expect(result.stdout()[1]).toBe(
      '[frogbot] 1 key differs from live, kept live: STRIPE_KEY. Use --update-keys to send local values.',
    );
  });

  it('stops on a key list with no salt, sending nothing', async () => {
    const { dojo, run } = await later();

    dojo.keysReply = [{ name: 'STRIPE_KEY', fingerprint: 'x' }];

    const result = await run([]);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] Couldn't read the app's keys: Dojo sent no salt or key list.",
    ]);
    expect(dojo.opened).toHaveLength(1);
    expect(dojo.paths().filter((path) => path === 'POST /api/apps/1/deployments')).toHaveLength(1);
  });

  it("names .frogbot/app.json when Dojo won't list the app's keys", async () => {
    const { dojo, run } = await later();

    dojo.forbidden.add(1);

    const result = await run([]);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      "[frogbot] You can't share to the app in .frogbot/app.json (1): Only the app’s owners can publish it. Delete .frogbot/app.json to share as a new app.",
    ]);
    expect(dojo.paths().filter((path) => path === 'POST /api/apps/1/deployments')).toHaveLength(1);
  });
});
