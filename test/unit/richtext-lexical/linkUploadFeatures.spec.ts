import { LinkFeature, UploadFeature } from '@frogbotai/richtext-lexical';
import type * as PayloadLexical from '@payloadcms/richtext-lexical';
import type { Field } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import type { FrogBot } from '../../../packages/frogbot/src/frogbot.js';
import { registerFrogBotInstance } from '../../../packages/frogbot/src/instanceRegistry.js';

type RuntimeField = Record<string, any>;

type RecordedArgs = { req: { frogbot?: unknown } };

vi.mock('@payloadcms/richtext-lexical', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadLexical>()),
  LinkFeature: vi.fn((props: unknown) => props),
  UploadFeature: vi.fn((props: unknown) => props),
}));

function recordedField(): Field {
  return {
    name: 'caption',
    type: 'text',
    defaultValue: (({ req }: RecordedArgs) => Boolean(req.frogbot)) as never,
    validate: ((_value: unknown, { req }: RecordedArgs) =>
      req.frogbot ? true : 'missing') as never,
  };
}

function bareRequest() {
  const payload = {};

  registerFrogBotInstance(payload, { agents: {} } as unknown as FrogBot);

  return { payload };
}

async function callField(field: RuntimeField, req: object) {
  return Promise.all([field.defaultValue({ req }), field.validate('Hello', { req })]);
}

describe('LinkFeature', () => {
  it('gives link field array functions req.frogbot on a bare request', async () => {
    const req = bareRequest();
    const props = LinkFeature({ fields: [recordedField()] }) as unknown as {
      fields: RuntimeField[];
    };

    expect(req).not.toHaveProperty('frogbot');
    expect(await callField(props.fields[0], req)).toEqual([true, true]);
  });

  it('gives fields returned by a link fields function req.frogbot', async () => {
    const req = bareRequest();
    const defaultFields = [{ name: 'url', type: 'text' }];
    const props = LinkFeature({
      fields: ({ defaultFields }) => [...defaultFields, recordedField()],
    }) as unknown as { fields: (args: { defaultFields: unknown[] }) => RuntimeField[] };

    const fields = props.fields({ defaultFields });

    expect(fields[0]).toBe(defaultFields[0]);
    expect(await callField(fields[1], req)).toEqual([true, true]);
  });

  it('leaves link fields unset when none are configured', () => {
    const props = LinkFeature({ maxDepth: 1 }) as unknown as { fields?: unknown; maxDepth: number };

    expect(props).toEqual({ fields: undefined, maxDepth: 1 });
  });
});

describe('UploadFeature', () => {
  it('gives upload node field functions req.frogbot on a bare request', async () => {
    const req = bareRequest();
    const props = UploadFeature({
      collections: { files: { fields: [recordedField()] } },
      maxDepth: 1,
    }) as unknown as { collections: Record<string, { fields: RuntimeField[] }>; maxDepth: number };

    expect(req).not.toHaveProperty('frogbot');
    expect(props.maxDepth).toBe(1);
    expect(await callField(props.collections.files.fields[0], req)).toEqual([true, true]);
  });
});
