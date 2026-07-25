import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Piece } from '../types/piece.js';
import { sanitize } from './sanitize.js';

const db = {} as never;

function piece(service: string, toolAction = 'run'): Piece {
  return {
    service,
    credentialType: 'none',
    actions: ['run'],
    tools: () => [{ slug: `${service}_${toolAction}`, description: 'Run', inputSchema: {} as never, execute: () => null }],
  };
}

describe('piece config', () => {
  it('accepts a hand-written piece', () => {
    const example = piece('example');
    const result = sanitize({ secret: 'secret', db, collections: [], pieces: [example] });
    expect(result.pieces).toEqual({ enabled: true, pieces: [example] });
  });

  it('rejects duplicate services', () => {
    expect(() => sanitize({ secret: 'secret', db, collections: [], pieces: [piece('example'), piece('example')] })).toThrow(
      "Duplicate piece service: 'example'",
    );
  });

  it('rejects unknown exposed actions', () => {
    expect(() => sanitize({ secret: 'secret', db, collections: [], pieces: [piece('example', 'missing')] })).toThrow(
      "Piece 'example' exposes unknown action 'missing'",
    );
  });

  it('requires a service ID at the type boundary', () => {
    expectTypeOf<{ credentialType: 'none'; actions: []; tools: () => [] }>().not.toMatchTypeOf<Piece>();
  });
});
