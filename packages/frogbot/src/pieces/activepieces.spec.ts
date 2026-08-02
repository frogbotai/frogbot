import * as textHelperModule from '@activepieces/piece-text-helper';
import { describe, expect, it, vi } from 'vitest';

import { createActivepiecesPiece } from '../exports/pieces.js';
import {
  executeActivepiecesAction,
  loadActivepiecesPiece,
  propertiesSchema,
  UnsupportedPieceContextError,
} from './activepieces.js';

describe('Activepieces adapter', () => {
  it('derives credential policies and creates one tool', () => {
    const create = (credentialType: 'none' | 'oauth2' | 'secret_text', auth?: Record<string, unknown>) => createActivepiecesPiece({
      module: textHelperModule, service: 'text', credentialType, defaultActions: ['concat'], config: auth ? { auth } : undefined,
    });
    expect(create('none').policy).toEqual({ type: 'none' });
    expect(create('secret_text').policy).toEqual({ type: 'user' });
    expect(create('secret_text', { apiKey: 'key' }).policy).toEqual({ type: 'developer', credential: { apiKey: 'key' } });
    expect(create('oauth2', { clientId: 'id', clientSecret: 'secret' }).policy).toMatchObject({ type: 'oauth', clientId: 'id', clientSecret: 'secret' });
    expect(create('none').tool('concat').slug).toBe('text_concat');
    expect(() => create('secret_text', { apiKey: 'key', allowUserOverride: true })).toThrow('not yet supported');
  });
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

  it('preserves number defaults and bounds', () => {
    const schema = propertiesSchema({ count: { type: 'NUMBER', required: false, defaultValue: 10, minimum: 1, maximum: 20 } });
    expect(schema.parse({})).toEqual({ count: 10 });
    expect(schema.safeParse({ count: 0 }).success).toBe(false);
    expect(schema.safeParse({ count: 21 }).success).toBe(false);
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
      ctx: { frogbot: { config: { files: { slug: 'media' } }, create } } as never,
    })).resolves.toBe('/media/result.txt');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ collection: 'media', overrideAccess: true }));
  });

  it('writes files through the default files collection', async () => {
    const create = vi.fn().mockResolvedValue({ url: '/files/result.txt' });
    await executeActivepiecesAction({
      action: {
        name: 'write', displayName: 'Write', description: 'Write', props: {},
        run: async (context) => (context.files as { write: (value: unknown) => Promise<string> }).write({ fileName: 'result.txt', data: Buffer.from('result') }),
      },
      propsValue: {},
      ctx: { frogbot: { config: { files: { slug: 'files' } }, create } } as never,
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ collection: 'files', data: {}, overrideAccess: true }));
  });

  it('rejects file writes without an upload collection', async () => {
    await expect(executeActivepiecesAction({
      action: {
        name: 'write', displayName: 'Write', description: 'Write', props: {},
        run: async (context) => (context.files as { write: (value: unknown) => Promise<string> }).write({ fileName: 'result.txt', data: Buffer.from('result') }),
      },
      propsValue: {},
      ctx: { frogbot: { config: {} } } as never,
    })).rejects.toThrow('files collection');
  });

  it('resolves connections by service key', async () => {
    const resolve = vi.fn().mockResolvedValue('token');
    await expect(executeActivepiecesAction({
      action: {
        name: 'connection', displayName: 'Connection', description: 'Connection', props: {},
        run: async (context) => (context.connections as { get: (key: string) => Promise<unknown> }).get('linear'),
      },
      propsValue: {},
      ctx: { req: { user: { id: 'owner' } }, frogbot: { connections: { resolve } } } as never,
    })).resolves.toBe('token');
    expect(resolve).toHaveBeenCalledWith({ service: 'linear', owner: { id: 'owner' } });
  });
});
