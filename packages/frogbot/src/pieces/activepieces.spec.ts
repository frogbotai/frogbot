import * as textHelperModule from '@activepieces/piece-text-helper';
import { describe, expect, it, vi } from 'vitest';

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

  it('preserves static dropdown value types', () => {
    const schema = propertiesSchema({ degree: { type: 'STATIC_DROPDOWN', required: true, options: { options: [{ value: 90 }, { value: 180 }] } } });
    expect(schema.safeParse({ degree: 90 }).success).toBe(true);
    expect(schema.safeParse({ degree: '90' }).success).toBe(false);
  });

  it('accepts dynamic properties as objects', () => {
    const schema = propertiesSchema({ authFields: { type: 'DYNAMIC', required: false } });
    expect(schema.safeParse({ authFields: { username: 'frog', password: 'bot' } }).success).toBe(true);
  });

  it('writes files through the configured upload collection', async () => {
    const create = vi.fn().mockResolvedValue({ url: '/media/result.txt' });
    await expect(executeActivepiecesAction({
      action: {
        name: 'write', displayName: 'Write', description: 'Write', props: {},
        run: async (context) => (context.files as { write: (value: unknown) => Promise<string> }).write({ fileName: 'result.txt', data: Buffer.from('result') }),
      },
      propsValue: {},
      ctx: { frogbot: { config: { pieceFiles: { collection: 'media' } }, create } } as never,
    })).resolves.toBe('/media/result.txt');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ collection: 'media', overrideAccess: true }));
  });

  it('rejects file writes without an upload collection', async () => {
    await expect(executeActivepiecesAction({
      action: {
        name: 'write', displayName: 'Write', description: 'Write', props: {},
        run: async (context) => (context.files as { write: (value: unknown) => Promise<string> }).write({ fileName: 'result.txt', data: Buffer.from('result') }),
      },
      propsValue: {},
      ctx: { frogbot: { config: {} } } as never,
    })).rejects.toThrow('pieceFiles.collection');
  });
});
