import { BlocksFeature } from '@frogbotai/richtext-lexical';
import type * as PayloadLexical from '@payloadcms/richtext-lexical';
import { describe, expect, it, vi } from 'vitest';

import type { FrogBot } from '../../../packages/frogbot/src/frogbot.js';
import { registerFrogBotInstance } from '../../../packages/frogbot/src/instanceRegistry.js';

type RuntimeBlock = { fields: Record<string, any>[]; slug: string } | string;

vi.mock('@payloadcms/richtext-lexical', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadLexical>()),
  BlocksFeature: vi.fn((props: unknown) => props),
}));

function recordFrogBot() {
  return vi.fn((args: { req: { frogbot?: unknown } }) => Boolean(args.req.frogbot));
}

describe('BlocksFeature', () => {
  it('gives block and inline block field functions req.frogbot on a bare request', async () => {
    const payload = {};
    const frogbot = { agents: {} };
    const defaultValue = recordFrogBot();
    const filterOptions = recordFrogBot();
    const validate = vi.fn((_value: unknown, options: { req: { frogbot?: unknown } }) =>
      options.req.frogbot ? true : 'missing',
    );

    registerFrogBotInstance(payload, frogbot as unknown as FrogBot);

    const props = BlocksFeature({
      blocks: [
        {
          slug: 'hero',
          fields: [{ name: 'title', type: 'text', defaultValue: defaultValue as never, validate }],
        },
        'shared',
      ],
      inlineBlocks: [
        {
          slug: 'mention',
          fields: [
            {
              name: 'user',
              type: 'relationship',
              relationTo: 'users',
              filterOptions: filterOptions as never,
            },
          ],
        },
      ],
    }) as unknown as { blocks: RuntimeBlock[]; inlineBlocks: RuntimeBlock[] };

    const [hero, shared] = props.blocks as [Exclude<RuntimeBlock, string>, string];
    const [mention] = props.inlineBlocks as [Exclude<RuntimeBlock, string>];
    const req = { payload };

    expect(req).not.toHaveProperty('frogbot');

    const results = await Promise.all([
      hero.fields[0].defaultValue({ req }),
      hero.fields[0].validate('Hello', { req }),
      mention.fields[0].filterOptions({ req }),
    ]);

    expect(results).toEqual([true, true, true]);
    expect(shared).toBe('shared');
  });
});
