import { describe, expect, it } from 'vitest';

describe('@frogbotai/graphql exports', () => {
  it('re-exports every GraphQL helper type from the types entry', async () => {
    const types = await import('@frogbotai/graphql/types');
    const upstream = await import('@payloadcms/graphql/types');

    expect(Object.keys(types).sort()).toEqual(Object.keys(upstream).sort());
  });

  it('exports only configToSchema from the root entry', async () => {
    const root = await import('@frogbotai/graphql');

    expect(Object.keys(root)).toEqual(['configToSchema']);
  });

  it('exports only generateSchema from the utilities entry', async () => {
    const utilities = await import('@frogbotai/graphql/utilities');

    expect(Object.keys(utilities)).toEqual(['generateSchema']);
  });
});
