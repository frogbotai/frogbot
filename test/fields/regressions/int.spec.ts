import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import type { FieldArgument } from './frogbot-types.js';
import {
  accessObservations,
  countRequests,
  databaseDirectory,
  fieldArgumentsSlug,
  hookObservations,
  nestedFieldsSlug,
  observedBlockSlug,
  payloadHookObservations,
  postsSlug,
  validatorObservations,
} from './shared.js';

describe('field runtime boundaries', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname(fileURLToPath(import.meta.url)));
  });

  afterAll(async () => {
    await booted?.shutdown();
    await rm(databaseDirectory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    countRequests.length = 0;
    hookObservations.length = 0;
    validatorObservations.length = 0;
    accessObservations.length = 0;
    payloadHookObservations.length = 0;
  });

  const blockData: NonNullable<FieldArgument['blocks']>[number] = {
    id: 'observed-row',
    blockType: observedBlockSlug,
    observed: 'Observed',
    validated: 'Validated',
    readable: 'Readable',
  };

  async function createArgumentDoc() {
    return booted.frogbot.create({
      collection: fieldArgumentsSlug,
      data: { blocks: [{ ...blockData }], payloadAuthored: 'Payload authored' },
      overrideAccess: true,
    });
  }

  it('handles missing after-change siblings while other phases receive their sibling fields', async () => {
    await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'Hooks' },
      overrideAccess: true,
    });

    await booted.frogbot.create({
      collection: nestedFieldsSlug,
      data: { group: { value: 'Nested' } },
      overrideAccess: true,
    });

    expect(hookObservations).toEqual(
      expect.arrayContaining([
        { field: 'title', phase: 'afterChange', siblingNames: undefined },
        { field: 'value', phase: 'afterChange', siblingNames: undefined },
        { field: 'value', phase: 'beforeValidate', siblingNames: ['value'] },
        { field: 'value', phase: 'beforeChange', siblingNames: ['value'] },
        { field: 'value', phase: 'afterRead', siblingNames: ['value'] },
      ]),
    );
  });

  it('supplies sibling fields to nested before-duplicate hooks', async () => {
    const post = await booted.frogbot.create({
      collection: nestedFieldsSlug,
      data: { group: { value: 'Nested' } },
      overrideAccess: true,
    });

    await booted.frogbot.duplicate({
      collection: nestedFieldsSlug,
      id: post.id,
      overrideAccess: true,
    });

    expect(hookObservations).toContainEqual({
      field: 'value',
      phase: 'beforeDuplicate',
      siblingNames: ['value'],
    });
  });

  it('field hooks receive path, schemaPath, indexPath and blockData in every phase', async () => {
    const doc = await createArgumentDoc();

    await booted.frogbot.duplicate({
      collection: fieldArgumentsSlug,
      id: doc.id,
      overrideAccess: true,
    });

    const observations = hookObservations.filter(({ field }) => field === 'observed');

    expect(new Set(observations.map(({ phase }) => phase))).toEqual(
      new Set(['beforeValidate', 'beforeChange', 'afterChange', 'afterRead', 'beforeDuplicate']),
    );

    observations.forEach((observation) => {
      expect(observation).toMatchObject({
        path: ['blocks', '0', 'observed'],
        schemaPath: ['blocks', observedBlockSlug, 'observed'],
        indexPath: [],
        blockData: {
          blockType: observedBlockSlug,
          observed: 'Observed',
          validated: 'Validated',
          readable: 'Readable',
        },
        globalIsNull: observation.phase !== 'beforeDuplicate',
        globalIsUndefined: observation.phase === 'beforeDuplicate',
        fieldNameType: 'string',
        hasFrogBot: true,
      });
    });
  });

  it('validators receive block data, preferences and field config', async () => {
    await createArgumentDoc();

    expect(validatorObservations).toEqual([
      {
        blockData: expect.objectContaining(blockData),
        preferences: { fields: {} },
        collectionSlug: fieldArgumentsSlug,
        minLength: 3,
      },
    ]);
  });

  it('field read access receives block data', async () => {
    const doc = await createArgumentDoc();

    accessObservations.length = 0;

    const persisted = await booted.frogbot.findByID({
      collection: fieldArgumentsSlug,
      id: doc.id,
      overrideAccess: false,
    });

    expect(accessObservations).toEqual([{ blockData: expect.objectContaining(blockData) }]);
    expect(persisted.blocks).toEqual([expect.objectContaining({ readable: 'Readable' })]);
  });

  it('a cast Payload-authored field hook receives req.payload', async () => {
    const doc = await createArgumentDoc();

    expect(payloadHookObservations).toEqual([true]);
    expect(doc.payloadAuthored).toBe('Payload authored');
  });
});
