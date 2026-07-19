import { describe, expect, it } from 'vitest';

import { buildGeneratedTypesFooter } from './generateTypes.js';

describe('frogbot generate:types', () => {
  it.todo('loads config from cwd via loadConfig');
  it.todo('honors FROGBOT_CONFIG_PATH when set');
  it.todo('writes to <cwd>/frogbot-types.ts by default');
  it.todo("redirects Payload's default outputFile (payload-types.ts) to frogbot-types.ts");
  it.todo('honors `typescript.outputFile` when the user has customized it');
  it.todo('honors FROGBOT_TS_OUTPUT_PATH override');
  it.todo('emits a FrogBot-branded banner (not Payload-branded)');
  it('augments FrogBot with the generated Config', () => {
    const footer = buildGeneratedTypesFooter([]);
    expect(footer).toContain("declare module 'frogbot'");
    expect(footer).toContain('export interface GeneratedTypes extends Config');
    expect(footer).not.toContain("declare module 'payload'");
  });
  it.todo('skips the write when output matches the existing file (deterministic)');
  it.todo('exits non-zero on any failure with a `[frogbot]` prefixed message');

  it('emits agent slugs in the GeneratedTypes augmentation', () => {
    expect(buildGeneratedTypesFooter(['media-buyer', 'support'])).toContain(`agents: {
      "media-buyer": unknown;
      "support": unknown;
    };`);
  });

  it('emits an empty agent map when no agents are configured', () => {
    expect(buildGeneratedTypesFooter([])).toContain('agents: {};');
  });
});
