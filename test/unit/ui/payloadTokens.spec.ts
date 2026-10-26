import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatPayloadTokens,
  OUTPUT,
  readPayloadTokens,
} from '../../../scripts/sync-payload-tokens.mjs';

describe('payload-tokens.css', () => {
  it('matches the installed admin panel tokens; run scripts/sync-payload-tokens.mjs after a bump', async () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(await formatPayloadTokens());
  });

  it("takes the dark tokens from Payload's dark theme, not its enhanced-contrast mode", () => {
    const names = readPayloadTokens().dark.map(([name]) => name);

    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });

  it('is imported by the FrogBot UI stylesheet', () => {
    const styles = readFileSync(resolve(OUTPUT, '../styles.css'), 'utf8');

    expect(styles).toContain('@import "./payload-tokens.css";');
  });
});
