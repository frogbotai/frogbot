import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';

import { isCliEntry } from './index.js';

const realFile = '/real/pkg/dist/cli/index.js';
const moduleUrl = pathToFileURL(realFile).href;

describe('isCliEntry', () => {
  it('matches when argv[1] is the module path itself', () => {
    expect(isCliEntry(moduleUrl, realFile, (p) => p)).toBe(true);
  });

  it('matches when argv[1] is a symlink to the module path (pnpm layout)', () => {
    const symlink = '/app/node_modules/@frogbotai/gateway/dist/cli/index.js';
    const realpath = (p: string) => (p === symlink ? realFile : p);
    expect(isCliEntry(moduleUrl, symlink, realpath)).toBe(true);
  });

  it('returns false without argv[1]', () => {
    expect(isCliEntry(moduleUrl, undefined, (p) => p)).toBe(false);
    expect(isCliEntry(moduleUrl, '', (p) => p)).toBe(false);
  });

  it('falls back to the raw path when realpath throws', () => {
    const realpath = () => {
      throw new Error('ENOENT');
    };
    expect(isCliEntry(moduleUrl, realFile, realpath)).toBe(true);
    expect(isCliEntry(moduleUrl, '/elsewhere/index.js', realpath)).toBe(false);
  });

  it('returns false for an unrelated entry path', () => {
    expect(isCliEntry(moduleUrl, '/other/tool.js', (p) => p)).toBe(false);
  });
});
