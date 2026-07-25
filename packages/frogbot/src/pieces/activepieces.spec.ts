import * as textHelperModule from '@activepieces/piece-text-helper';
import { describe, expect, it } from 'vitest';

import {
  executeActivepiecesAction,
  loadActivepiecesPiece,
  propertiesSchema,
  UnsupportedPieceContextError,
} from './activepieces.js';

describe('Activepieces adapter', () => {
  it('loads one real piece and its metadata', () => {
    const piece = loadActivepiecesPiece(textHelperModule);
    expect(piece.metadata().displayName).toBe('Text Helper');
    expect(Object.keys(piece.actions())).toHaveLength(11);
  });

  it('rejects ambiguous modules', () => {
    const piece = loadActivepiecesPiece(textHelperModule);
    expect(() => loadActivepiecesPiece({ first: piece, second: piece })).toThrow('found 2');
  });

  it.each([
    'SHORT_TEXT', 'LONG_TEXT', 'MARKDOWN', 'DROPDOWN', 'STATIC_DROPDOWN', 'NUMBER', 'CHECKBOX',
    'ARRAY', 'OBJECT', 'JSON', 'MULTI_SELECT_DROPDOWN', 'STATIC_MULTI_SELECT_DROPDOWN', 'DYNAMIC',
    'DATE_TIME', 'FILE', 'COLOR',
  ])('maps %s to a valid schema', (type) => {
    expect(propertiesSchema({ value: { type, required: false } }).safeParse({}).success).toBe(true);
  });

  it('throws a named error for unsupported context access', async () => {
    await expect(executeActivepiecesAction({
      action: {
        name: 'unsupported',
        displayName: 'Unsupported',
        description: 'Unsupported',
        props: {},
        run: async (context) => (context.store as { get: () => unknown }).get(),
      },
      propsValue: {},
    })).rejects.toBeInstanceOf(UnsupportedPieceContextError);
  });
});
