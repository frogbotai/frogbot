import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { interpolateConfigText } from './variable.js';
import { ConfigError } from '../errors/gatewayError.js';

const scratch = () => realpathSync(mkdtempSync(join(tmpdir(), 'frogbotai-gateway-variable-')));

describe('interpolateConfigText', () => {
  it('substitutes env variables', async () => {
    const out = await interpolateConfigText({
      text: JSON.stringify({ apiKey: '{env:FROGBOTAI_VAR_KEY}' }),
      source: '/tmp/gateway.config.json',
      env: { FROGBOTAI_VAR_KEY: 'plain-key' },
    });
    expect(JSON.parse(out)).toEqual({ apiKey: 'plain-key' });
  });

  it('JSON-escapes env values with quotes, backslashes, and newlines', async () => {
    const value = 'a"b\\c\nd';
    const out = await interpolateConfigText({
      text: JSON.stringify({ apiKey: '{env:FROGBOTAI_VAR_SPECIAL}' }),
      source: '/tmp/gateway.config.json',
      env: { FROGBOTAI_VAR_SPECIAL: value },
    });
    expect(JSON.parse(out)).toEqual({ apiKey: value });
  });

  it('throws ConfigError for a missing env variable', async () => {
    await expect(
      interpolateConfigText({
        text: '{"apiKey":"{env:FROGBOTAI_VAR_MISSING}"}',
        source: '/tmp/gateway.config.json',
        env: {},
      }),
    ).rejects.toThrow(ConfigError);
    await expect(
      interpolateConfigText({
        text: '{"apiKey":"{env:FROGBOTAI_VAR_MISSING}"}',
        source: '/tmp/gateway.config.json',
        env: {},
      }),
    ).rejects.toThrow(/FROGBOTAI_VAR_MISSING/);
  });

  it('substitutes file contents, escaped for JSON', async () => {
    const dir = scratch();
    writeFileSync(join(dir, 'secret.txt'), 'line"1\nline\\2\n');
    const out = await interpolateConfigText({
      text: JSON.stringify({ apiKey: '{file:./secret.txt}' }),
      source: join(dir, 'gateway.config.json'),
      env: {},
    });
    expect(JSON.parse(out)).toEqual({ apiKey: 'line"1\nline\\2' });
  });

  it('throws ConfigError for an unreadable file', async () => {
    const dir = scratch();
    await expect(
      interpolateConfigText({
        text: JSON.stringify({ apiKey: '{file:./nope.txt}' }),
        source: join(dir, 'gateway.config.json'),
        env: {},
      }),
    ).rejects.toThrow(ConfigError);
  });
});

describe('interpolateConfigText escape syntax (D5c)', () => {
  it('leaves an escaped env token literal', async () => {
    const out = await interpolateConfigText({
      text: '\\{env:FOO}',
      source: '/tmp/gateway.config.json',
      env: { FOO: 'resolved' },
    });
    expect(out).toBe('{env:FOO}');
  });

  it('resolves an unescaped env token', async () => {
    const out = await interpolateConfigText({
      text: '{env:FOO}',
      source: '/tmp/gateway.config.json',
      env: { FOO: 'resolved' },
    });
    expect(out).toBe('resolved');
  });

  it('leaves an escaped file token literal', async () => {
    const out = await interpolateConfigText({
      text: '\\{file:./secret.txt}',
      source: '/tmp/gateway.config.json',
      env: {},
    });
    expect(out).toBe('{file:./secret.txt}');
  });

  it('unescapes a doubled backslash and resolves the env token', async () => {
    const out = await interpolateConfigText({
      text: '\\\\{env:FOO}',
      source: '/tmp/gateway.config.json',
      env: { FOO: 'resolved' },
    });
    expect(out).toBe('\\resolved');
  });

  it('mixes escaped and resolved tokens in one value', async () => {
    const out = await interpolateConfigText({
      text: '\\{env:A}{env:B}',
      source: '/tmp/gateway.config.json',
      env: { A: 'aa', B: 'bb' },
    });
    expect(out).toBe('{env:A}bb');
  });

  it('does not resolve an env token inside an escaped file path', async () => {
    const out = await interpolateConfigText({
      text: '\\{file:./\\{env:FOO}.txt}',
      source: '/tmp/gateway.config.json',
      env: { FOO: 'resolved' },
    });
    expect(out).toBe('{file:./{env:FOO}.txt}');
  });
});

describe('interpolateConfigText path traversal guard (D5b)', () => {
  it('allows a file inside the config directory', async () => {
    const dir = scratch();
    writeFileSync(join(dir, 'valid.txt'), 'ok');
    const out = await interpolateConfigText({
      text: JSON.stringify({ apiKey: '{file:./valid.txt}' }),
      source: join(dir, 'gateway.config.json'),
      env: {},
    });
    expect(JSON.parse(out)).toEqual({ apiKey: 'ok' });
  });

  it('allows deep nesting within the config directory', async () => {
    const dir = scratch();
    mkdirSync(join(dir, 'a/b/c'), { recursive: true });
    writeFileSync(join(dir, 'a/b/c/secret.txt'), 'deep');
    const out = await interpolateConfigText({
      text: JSON.stringify({ apiKey: '{file:./a/b/c/../../b/c/secret.txt}' }),
      source: join(dir, 'gateway.config.json'),
      env: {},
    });
    expect(JSON.parse(out)).toEqual({ apiKey: 'deep' });
  });

  it('blocks an absolute path outside the config directory', async () => {
    const dir = scratch();
    await expect(
      interpolateConfigText({
        text: JSON.stringify({ apiKey: '{file:/etc/passwd}' }),
        source: join(dir, 'gateway.config.json'),
        env: {},
      }),
    ).rejects.toThrow(/resolves outside the config directory/);
  });

  it('blocks relative traversal escaping the config directory', async () => {
    const dir = scratch();
    await expect(
      interpolateConfigText({
        text: JSON.stringify({ apiKey: '{file:../../etc/shadow}' }),
        source: join(dir, 'gateway.config.json'),
        env: {},
      }),
    ).rejects.toThrow(/resolves outside the config directory/);
  });

  it('blocks the filesystem root', async () => {
    const dir = scratch();
    await expect(
      interpolateConfigText({
        text: JSON.stringify({ apiKey: '{file:/}' }),
        source: join(dir, 'gateway.config.json'),
        env: {},
      }),
    ).rejects.toThrow(/resolves outside the config directory/);
  });

  it('blocks a symlink inside the config directory that escapes it', async () => {
    const root = scratch();
    const dir = join(root, 'config');
    const outside = join(root, 'outside');
    mkdirSync(dir);
    mkdirSync(outside);
    writeFileSync(join(outside, 'secret.txt'), 'exfiltrated');
    symlinkSync(join(outside, 'secret.txt'), join(dir, 'link.txt'));
    await expect(
      interpolateConfigText({
        text: JSON.stringify({ apiKey: '{file:./link.txt}' }),
        source: join(dir, 'gateway.config.json'),
        env: {},
      }),
    ).rejects.toThrow(/resolves outside the config directory/);
  });

  it('resolves a symlink inside the config directory that stays inside it', async () => {
    const dir = scratch();
    writeFileSync(join(dir, 'real.txt'), 'inside');
    symlinkSync(join(dir, 'real.txt'), join(dir, 'link.txt'));
    const out = await interpolateConfigText({
      text: JSON.stringify({ apiKey: '{file:./link.txt}' }),
      source: join(dir, 'gateway.config.json'),
      env: {},
    });
    expect(JSON.parse(out)).toEqual({ apiKey: 'inside' });
  });

  it('produces a distinguishable error for a not-found file inside the directory', async () => {
    const dir = scratch();
    await expect(
      interpolateConfigText({
        text: JSON.stringify({ apiKey: '{file:./missing.txt}' }),
        source: join(dir, 'gateway.config.json'),
        env: {},
      }),
    ).rejects.toThrow(/ENOENT/);
  });

  it('does not report a not-found error for a path escaping the directory', async () => {
    const dir = scratch();
    await expect(
      interpolateConfigText({
        text: JSON.stringify({ apiKey: '{file:/etc/definitely-not-here-xyz}' }),
        source: join(dir, 'gateway.config.json'),
        env: {},
      }),
    ).rejects.toThrow(/resolves outside the config directory/);
  });

  it('throws a graceful error for an empty file path', async () => {
    const dir = scratch();
    await expect(
      interpolateConfigText({
        text: JSON.stringify({ apiKey: '{file:}' }),
        source: join(dir, 'gateway.config.json'),
        env: {},
      }),
    ).rejects.toThrow(/empty file path/);
  });

  it('blocks a home-relative path that escapes the config directory', async () => {
    const dir = scratch();
    await expect(
      interpolateConfigText({
        text: JSON.stringify({ apiKey: '{file:~/../outside}' }),
        source: join(dir, 'gateway.config.json'),
        env: {},
      }),
    ).rejects.toThrow(/resolves outside the config directory/);
  });
});
