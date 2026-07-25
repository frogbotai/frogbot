import { describe, expect, it } from 'vitest';

import type { Piece } from '../types/piece.js';
import { resolveCredentialSources } from './sources.js';

const piece = { service: 'linear', credentialType: 'secret_text', actions: [], tools: () => [] } as Piece;
const source = { key: 'one', services: ['linear'], credentialTypes: ['secret_text'] } as const;

describe('resolveCredentialSources', () => {
  it('selects a single claiming source', () => {
    expect(resolveCredentialSources({ sources: [source], assignments: {}, pieces: [piece] })).toEqual({ linear: 'one' });
  });

  it('uses an explicit assignment when sources overlap', () => {
    const two = { ...source, key: 'two' } as const;
    expect(resolveCredentialSources({ sources: [source, two], assignments: { linear: 'two' }, pieces: [piece] })).toEqual({ linear: 'two' });
  });

  it('fails for ambiguous, missing, and invalid sources', () => {
    const two = { ...source, key: 'two' } as const;
    expect(() => resolveCredentialSources({ sources: [source, two], assignments: {}, pieces: [piece] })).toThrow('multiple credential sources');
    expect(() => resolveCredentialSources({ sources: [], assignments: {}, pieces: [piece] })).toThrow('no source claims it');
    expect(() => resolveCredentialSources({ sources: [source], assignments: { linear: 'missing' }, pieces: [piece] })).toThrow("cannot provide 'linear'");
  });
});
