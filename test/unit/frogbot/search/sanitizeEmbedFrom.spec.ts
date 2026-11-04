import type * as PayloadModule from 'payload';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getConfiguredEmbeddingModelIds } from '../../../../packages/frogbot/src/ai/models.js';
import type { AIConfig, ModelId } from '../../../../packages/frogbot/src/ai/types.js';
import type { CollectionConfig } from '../../../../packages/frogbot/src/collections/config/types.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import type { Block, Field } from '../../../../packages/frogbot/src/fields/config/types.js';
import { embedFrom } from '../../../../packages/frogbot/src/search/embedFrom.js';
import { sanitizeEmbedFrom } from '../../../../packages/frogbot/src/search/sanitizeEmbedFrom.js';

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadModule>()),
  buildConfig: vi.fn((config: Record<string, unknown>) =>
    Promise.resolve({ globals: [], ...config }),
  ),
}));

const { sanitize } = await import('../../../../packages/frogbot/src/config/sanitize.js');

const EMBEDDING = 'openai/text-embedding-3-small' as ModelId;

const ai: AIConfig = {
  providers: { openai: true },
  routers: {
    search: { model: EMBEDDING },
    writer: { model: 'openai/gpt-5-nano' },
  },
};

const title: Field = { name: 'title', type: 'text' };

function vector(
  options: { model?: ModelId; fields?: string[] } = {},
  extra: { localized?: boolean } = {},
): Field {
  return {
    name: 'embedding',
    type: 'vector',
    dimensions: 3,
    hooks: {
      beforeChange: [
        embedFrom({ model: options.model ?? EMBEDDING, fields: options.fields ?? ['title'] }),
      ],
    },
    ...extra,
  };
}

function posts(fields: Field[]): CollectionConfig {
  return { slug: 'posts', fields };
}

function check(
  collections: CollectionConfig[],
  { blocks, mode = 'runtime' }: { blocks?: Block[]; mode?: 'codegen' | 'runtime' } = {},
) {
  return () => sanitizeEmbedFrom({ ai, blocks, collections, mode });
}

function failure(path: string, problem: string, owner = 'collection "posts"'): string {
  return `[frogbot] embedFrom on field "${path}" in ${owner}: ${problem}`;
}

describe('getConfiguredEmbeddingModelIds', () => {
  it('lists configured embedding models and routers that point at one', () => {
    const ids = getConfiguredEmbeddingModelIds(ai);

    expect(ids).toContain(EMBEDDING);
    expect(ids).toContain('search');
    expect(ids).not.toContain('writer');
    expect(ids).not.toContain('openai/gpt-5-nano');
  });
});

describe('sanitizeEmbedFrom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts sibling text-like sources, including ones inside rows, tabs and collapsibles', () => {
    const fields: Field[] = [
      { type: 'row', fields: [{ name: 'title', type: 'text' }] },
      {
        type: 'tabs',
        tabs: [{ label: 'Body', fields: [{ name: 'body', type: 'textarea' }] }],
      },
      { type: 'collapsible', label: 'More', fields: [{ name: 'email', type: 'email' }] },
      { name: 'snippet', type: 'code' },
      vector({ model: 'search' as ModelId, fields: ['title', 'body', 'email', 'snippet'] }),
    ];

    expect(check([posts(fields)])).not.toThrow();
  });

  it('rejects the hook on a field that is not a vector', () => {
    const field = {
      name: 'summary',
      type: 'json',
      hooks: { beforeChange: [embedFrom({ model: EMBEDDING, fields: ['title'] })] },
    } as Field;

    expect(check([posts([title, field])])).toThrow(
      failure('summary', 'it must be on a vector field'),
    );
  });

  it('rejects the hook outside hooks.beforeChange', () => {
    const field = {
      name: 'embedding',
      type: 'vector',
      dimensions: 3,
      hooks: { beforeValidate: [embedFrom({ model: EMBEDDING, fields: ['title'] })] },
    } as Field;

    expect(check([posts([title, field])])).toThrow(
      failure('embedding', 'it must be in `hooks.beforeChange`'),
    );
  });

  it('rejects a source that is not a sibling field', () => {
    const fields: Field[] = [
      { name: 'meta', type: 'group', fields: [{ name: 'title', type: 'text' }] },
      vector(),
    ];

    expect(check([posts(fields)])).toThrow(
      failure('embedding', 'source "title" is not a sibling field'),
    );
  });

  it('rejects a source that is not text-like', () => {
    expect(check([posts([{ name: 'title', type: 'number' }, vector()])])).toThrow(
      failure('embedding', 'source "title" must be a text, textarea, email or code field'),
    );
  });

  it('rejects a hasMany text source', () => {
    const source = { name: 'title', type: 'text', hasMany: true } as Field;

    expect(check([posts([source, vector()])])).toThrow(
      failure('embedding', 'source "title" must hold one string, not `hasMany`'),
    );
  });

  it('rejects the hook in collection hooks', () => {
    const collection: CollectionConfig = {
      slug: 'posts',
      fields: [title, { name: 'embedding', type: 'vector', dimensions: 3 }],
      hooks: { beforeChange: [embedFrom({ model: EMBEDDING, fields: ['title'] }) as never] },
    };

    expect(check([collection])).toThrow(
      '[frogbot] embedFrom in collection "posts" hooks: it must be in a vector field\'s `hooks.beforeChange`',
    );
  });

  it('rejects a localized source when the vector is not localized', () => {
    expect(check([posts([{ name: 'title', type: 'text', localized: true }, vector()])])).toThrow(
      failure(
        'embedding',
        'source "title" is localized, so the vector field must be localized too',
      ),
    );
  });

  it('accepts a localized source with a localized vector or a localized parent', () => {
    const localizedTitle: Field = { name: 'title', type: 'text', localized: true };

    expect(check([posts([localizedTitle, vector({}, { localized: true })])])).not.toThrow();

    const group: Field = {
      name: 'meta',
      type: 'group',
      localized: true,
      fields: [localizedTitle, vector()],
    };

    expect(check([posts([group])])).not.toThrow();
  });

  it('names nested paths and blocks', () => {
    const nested: Field = {
      name: 'items',
      type: 'array',
      fields: [{ name: 'title', type: 'number' }, vector()],
    };

    expect(check([posts([nested])])).toThrow(
      failure('items.embedding', 'source "title" must be a text, textarea, email or code field'),
    );

    const inline: Field = {
      name: 'layout',
      type: 'blocks',
      blocks: [{ slug: 'note', fields: [vector({ fields: ['body'] })] }],
    };

    expect(check([posts([inline])])).toThrow(
      failure('layout.note.embedding', 'source "body" is not a sibling field'),
    );

    const block: Block = { slug: 'card', fields: [vector({ fields: ['body'] })] };

    expect(check([], { blocks: [block] })).toThrow(
      failure('embedding', 'source "body" is not a sibling field', 'block "card"'),
    );
  });

  it.each([
    ['not configured', 'anthropic/voyage-3', "model 'anthropic/voyage-3' is not configured"],
    [
      'not an embedding model',
      'openai/gpt-5-nano',
      "model 'openai/gpt-5-nano' is not an embedding model",
    ],
    ['a router to a chat model', 'writer', "model 'writer' is not an embedding model"],
  ])('rejects a model that is %s at runtime', (_label, model, problem) => {
    expect(check([posts([title, vector({ model: model as ModelId })])])).toThrow(
      failure('embedding', problem),
    );
  });

  it('warns about a bad model at build time', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const model = 'openai/gpt-5-nano' as ModelId;

    expect(check([posts([title, vector({ model })])], { mode: 'codegen' })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      failure('embedding', "model 'openai/gpt-5-nano' is not an embedding model"),
    );
  });

  it('runs during config sanitize, where no ai config means the model is not configured', () => {
    const config: FrogBotConfig = {
      secret: 'test-secret',
      db: {} as FrogBotConfig['db'],
      collections: [posts([title, vector()])],
    };

    expect(() => sanitize(config)).toThrow(
      failure('embedding', `model '${EMBEDDING}' is not configured`),
    );
  });
});
