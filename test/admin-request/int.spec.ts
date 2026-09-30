import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Payload, PayloadRequest } from 'payload';
import { createLocalReq } from 'payload';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { requestCalls } from './config.js';
import {
  bodyBlockSlots,
  bodyBlockSlug,
  brokenPagesSlug,
  pageSlots,
  pagesSlug,
  previewFailureMessage,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromNext = createRequire(path.resolve(dirname, '../../packages/next/package.json'));

type HandlePreview = (args: {
  collectionSlug: string;
  config: Payload['config'];
  data: Record<string, unknown>;
  operation: 'create' | 'update';
  req: PayloadRequest;
}) => Promise<{ isPreviewEnabled?: boolean; previewURL?: string }>;

type FieldSchemasToFormState = (args: {
  collectionSlug: string;
  data: Record<string, unknown>;
  fields: unknown[];
  fieldSchemaMap: undefined;
  operation: 'create' | 'update';
  permissions: true;
  preferences: { fields: Record<string, unknown> };
  renderAllFields: false;
  req: PayloadRequest;
  schemaPath: string;
}) => Promise<Record<string, unknown>>;

type BuildFieldSchemaMap = (args: {
  collectionSlug: string;
  config: Payload['config'];
  i18n: PayloadRequest['i18n'];
}) => { fieldSchemaMap: Map<string, { fields: unknown[] }> };

async function importFromUI<T>(specifier: string, name: string): Promise<T> {
  const module = (await import(pathToFileURL(requireFromNext.resolve(specifier)).href)) as Record<
    string,
    T
  >;

  return module[name];
}

const handlePreview = await importFromUI<HandlePreview>(
  '@payloadcms/ui/utilities/handlePreview',
  'handlePreview',
);
const fieldSchemasToFormState = await importFromUI<FieldSchemasToFormState>(
  '@payloadcms/ui/forms/fieldSchemasToFormState',
  'fieldSchemasToFormState',
);
const buildFieldSchemaMap = await importFromUI<BuildFieldSchemaMap>(
  '@payloadcms/ui/utilities/buildFieldSchemaMap/index',
  'buildFieldSchemaMap',
);

function slotsSeen(slots: readonly string[]) {
  return slots.map((slot) => ({ hasFrogBot: true, slot }));
}

describe('admin request', () => {
  let booted: BootedFrogBot;
  let req: PayloadRequest;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'editor@frogbot.local', password: 'editor-password' },
    });

    req = await createLocalReq(
      { user: { ...user, collection: usersSlug } as never },
      booted.payload,
    );
    requestCalls.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('admin preview receives req.frogbot on an untouched request', async () => {
    expect(req).not.toHaveProperty('frogbot');

    const result = await handlePreview({
      collectionSlug: pagesSlug,
      config: booted.payload.config,
      data: { id: 'page-1' },
      operation: 'update',
      req,
    });

    expect(result).toEqual({ isPreviewEnabled: true, previewURL: '/preview/page-1' });
    expect(requestCalls).toEqual(slotsSeen(['preview']));
  });

  it('admin preview is not called for a create form', async () => {
    const result = await handlePreview({
      collectionSlug: pagesSlug,
      config: booted.payload.config,
      data: {},
      operation: 'create',
      req,
    });

    expect(result).toEqual({ isPreviewEnabled: true, previewURL: undefined });
    expect(requestCalls).toEqual([]);
  });

  it('a throwing admin preview is logged and returns no preview URL', async () => {
    const error = vi.spyOn(booted.payload.logger, 'error').mockImplementation(() => undefined);

    const result = await handlePreview({
      collectionSlug: brokenPagesSlug,
      config: booted.payload.config,
      data: { id: 'page-1' },
      operation: 'update',
      req,
    });

    expect(result).toEqual({ isPreviewEnabled: true, previewURL: undefined });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ message: previewFailureMessage }) }),
    );
  });

  it('admin form state gives req.frogbot to defaultValue, filterOptions, validate and field access', async () => {
    expect(req).not.toHaveProperty('frogbot');

    const state = await fieldSchemasToFormState({
      collectionSlug: pagesSlug,
      data: {},
      fields: booted.payload.collections[pagesSlug].config.fields,
      fieldSchemaMap: undefined,
      operation: 'create',
      permissions: true,
      preferences: { fields: {} },
      renderAllFields: false,
      req,
      schemaPath: pagesSlug,
    });

    expect(state.title).toMatchObject({ value: 'Untitled' });
    expect(state.color).toMatchObject({ selectFilterOptions: ['red', 'green'] });
    expect(requestCalls).toEqual(expect.arrayContaining(slotsSeen(pageSlots)));
    expect(requestCalls.filter(({ hasFrogBot }) => !hasFrogBot)).toEqual([]);
  });

  it('rich text block form state gives req.frogbot to block field functions', async () => {
    const { fieldSchemaMap } = buildFieldSchemaMap({
      collectionSlug: pagesSlug,
      config: booted.payload.config,
      i18n: req.i18n,
    });
    const schemaPath = [...fieldSchemaMap.keys()].find((key) =>
      key.endsWith(`.lexical_blocks.${bodyBlockSlug}.fields`),
    )!;
    const { fields } = fieldSchemaMap.get(schemaPath)!;

    expect(req).not.toHaveProperty('frogbot');

    const state = await fieldSchemasToFormState({
      collectionSlug: pagesSlug,
      data: {},
      fields,
      fieldSchemaMap: undefined,
      operation: 'create',
      permissions: true,
      preferences: { fields: {} },
      renderAllFields: false,
      req,
      schemaPath,
    });

    expect(state.tone).toMatchObject({ value: 'info' });
    expect(requestCalls).toEqual(slotsSeen(bodyBlockSlots));
  });

  it('create through the local API still gives field functions req.frogbot', async () => {
    const page = await booted.frogbot.create({
      collection: pagesSlug,
      data: {},
      overrideAccess: false,
    });

    expect(page.title).toBe('Untitled');
    expect(requestCalls).toEqual(
      expect.arrayContaining(slotsSeen(['defaultValue', 'validate', 'access.read'])),
    );
    expect(requestCalls.filter(({ hasFrogBot }) => !hasFrogBot)).toEqual([]);
  });
});
