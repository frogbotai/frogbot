import * as root from '@frogbotai/graphql';
import * as types from '@frogbotai/graphql/types';
import * as utilities from '@frogbotai/graphql/utilities';
import * as upstream from '@payloadcms/graphql/types';
import { describe, expect, it } from 'vitest';

describe('@frogbotai/graphql exports', () => {
  it('re-exports every GraphQL helper type from the types entry', () => {
    expect(Object.keys(types).sort()).toEqual(Object.keys(upstream).sort());
  });

  it('exports only configToSchema from the root entry', () => {
    expect(Object.keys(root)).toEqual(['configToSchema']);
  });

  it('exports only generateSchema from the utilities entry', () => {
    expect(Object.keys(utilities)).toEqual(['generateSchema']);
  });
});
