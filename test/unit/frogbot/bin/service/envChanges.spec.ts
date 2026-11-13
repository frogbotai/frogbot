import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  isEnvOnly,
  publicEnvChanged,
  readPublicEnv,
} from '../../../../../packages/frogbot/src/bin/service/envChanges.js';

describe('an env-only change', () => {
  it.each([[['.env']], [['.env.local', '.env.production']]])('is %j', (paths) => {
    expect(isEnvOnly(paths)).toBe(true);
  });

  it.each([[[]], [['.env', 'src/app/page.tsx']], [['frogbot.config.ts']], [['src/.env']]])(
    'is not %j',
    (paths) => {
      expect(isEnvOnly(paths)).toBe(false);
    },
  );
});

describe('NEXT_PUBLIC_ changes', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frogbot-env-'));
    writeFileSync(join(dir, '.env'), 'SECRET=a\nNEXT_PUBLIC_SITE=Acme\n');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const after = (file: string, text: string) => {
    const before = readPublicEnv(dir);

    writeFileSync(join(dir, file), text);

    return publicEnvChanged(before, readPublicEnv(dir));
  };

  it('names none when only private keys change', () => {
    expect(after('.env', 'SECRET=b\nNEXT_PUBLIC_SITE=Acme\n')).toEqual([]);
  });

  it('names none when a file is rewritten the same, comments and quotes aside', () => {
    expect(after('.env', '# site\nSECRET=a\nNEXT_PUBLIC_SITE="Acme"\n')).toEqual([]);
  });

  it('names a changed key', () => {
    expect(after('.env', 'SECRET=a\nNEXT_PUBLIC_SITE=Beta\n')).toEqual(['NEXT_PUBLIC_SITE']);
  });

  it('names an added key', () => {
    expect(after('.env', 'SECRET=a\nNEXT_PUBLIC_SITE=Acme\nNEXT_PUBLIC_X=1\n')).toEqual([
      'NEXT_PUBLIC_X',
    ]);
  });

  it('names a removed key', () => {
    expect(after('.env', 'SECRET=a\n')).toEqual(['NEXT_PUBLIC_SITE']);
  });

  it('names a key set in .env.local, even with the same value as .env', () => {
    expect(after('.env.local', 'NEXT_PUBLIC_SITE=Acme\n')).toEqual(['NEXT_PUBLIC_SITE']);
  });

  it('names a variable a NEXT_PUBLIC_ value references, as Next expands it', () => {
    writeFileSync(join(dir, '.env'), 'BASE=http://one\nNEXT_PUBLIC_URL=${BASE}/x\n');

    expect(after('.env', 'BASE=http://two\nNEXT_PUBLIC_URL=${BASE}/x\n')).toEqual(['BASE']);
  });

  it('resolves a reference from the shell before the files', () => {
    writeFileSync(join(dir, '.env'), 'BASE=file\nNEXT_PUBLIC_URL=$BASE/x\n');

    const before = readPublicEnv(dir, { BASE: 'shell' });

    writeFileSync(join(dir, '.env'), 'BASE=changed\nNEXT_PUBLIC_URL=$BASE/x\n');

    expect(publicEnvChanged(before, readPublicEnv(dir, { BASE: 'shell' }))).toEqual([]);
  });

  it('names a key on the first line of a file saved with a UTF-8 BOM', () => {
    writeFileSync(join(dir, '.env'), '\uFEFFNEXT_PUBLIC_SITE=Acme\n');

    expect(after('.env', '\uFEFFNEXT_PUBLIC_SITE=Beta\n')).toEqual(['NEXT_PUBLIC_SITE']);
  });

  it('names a key written as `KEY: value`, which Next also reads', () => {
    writeFileSync(join(dir, '.env'), 'NEXT_PUBLIC_SITE: Acme\n');

    expect(after('.env', 'NEXT_PUBLIC_SITE: Beta\n')).toEqual(['NEXT_PUBLIC_SITE']);
  });

  it('resolves a reference the shell sets empty from the files, as Next does', () => {
    writeFileSync(join(dir, '.env'), 'NEXT_PUBLIC_URL=$BASE/x\nBASE=http://one\n');

    const before = readPublicEnv(dir, { BASE: '' });

    writeFileSync(join(dir, '.env'), 'NEXT_PUBLIC_URL=$BASE/x\nBASE=http://two\n');

    expect(publicEnvChanged(before, readPublicEnv(dir, { BASE: '' }))).toEqual(['BASE']);
  });

  it.each(['.env.example', '.env.development', '.env.test'])(
    'ignores %s, which a production build never loads',
    (file) => {
      expect(after(file, 'NEXT_PUBLIC_SITE=Other\n')).toEqual([]);
    },
  );

  it('reads nothing from a folder that is gone', () => {
    expect(readPublicEnv(join(dir, 'missing')).size).toBe(0);
  });
});
