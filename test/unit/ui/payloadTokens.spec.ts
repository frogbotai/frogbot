import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { formatPayloadTokens, OUTPUT } from '../../../scripts/sync-payload-tokens.mjs';

describe('payload-tokens.css', () => {
  it('matches the installed admin panel tokens; run scripts/sync-payload-tokens.mjs after a bump', async () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(await formatPayloadTokens());
  });

  it('is imported by the FrogBot UI stylesheet', () => {
    const styles = readFileSync(resolve(OUTPUT, '../styles.css'), 'utf8');

    expect(styles).toContain('@import "./payload-tokens.css";');
  });
});
