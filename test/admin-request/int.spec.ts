import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Payload, PayloadRequest } from 'payload';
import { createLocalReq } from 'payload';
import { applyLocaleFiltering } from 'payload/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { requestCalls } from './config.js';
import {
  assetHandlerResponse,
  assetsSlug,
  bodyBlockSlots,
  bodyBlockSlug,
  brokenPagesSlug,
  linkFieldSlots,
  pageSlots,
  pagesSlug,
  previewFailureMessage,
  uploadNodeFieldSlots,
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

type FormatDocURL = (args: {
  collectionSlug: string;
  defaultURL: string;
  doc: Record<string, unknown>;
  req: PayloadRequest;
  viewType: 'list';
}) => null | string;

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

  async function richTextFeatureFormState(schemaPathSuffix: string) {
    const { fieldSchemaMap } = buildFieldSchemaMap({
      collectionSlug: pagesSlug,
      config: booted.payload.config,
      i18n: req.i18n,
    });
    const schemaPath = [...fieldSchemaMap.keys()].find((key) => key.endsWith(schemaPathSuffix))!;
    const { fields } = fieldSchemaMap.get(schemaPath)!;

    return fieldSchemasToFormState({
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
  }

  it('rich text link drawer form state gives req.frogbot to added link fields', async () => {
    expect(req).not.toHaveProperty('frogbot');

    const state = await richTextFeatureFormState('.lexical_internal_feature.link.fields');

    expect(state.rel).toMatchObject({ value: 'rel' });
    expect(requestCalls).toEqual(slotsSeen(linkFieldSlots));
  });

  it('rich text upload drawer form state gives req.frogbot to upload node fields', async () => {
    expect(req).not.toHaveProperty('frogbot');

    const state = await richTextFeatureFormState(`.lexical_internal_feature.upload.${assetsSlug}`);

    expect(state.caption).toMatchObject({ value: 'caption' });
    expect(requestCalls).toEqual(slotsSeen(uploadNodeFieldSlots));
  });

  it('the admin.formatDocURL the list view reads gives req.frogbot synchronously', () => {
    const formatDocURL = booted.payload.collections[pagesSlug].config.admin
      .formatDocURL as FormatDocURL;

    expect(req).not.toHaveProperty('frogbot');

    const url = formatDocURL({
      collectionSlug: pagesSlug,
      defaultURL: `/collections/${pagesSlug}/page-1`,
      doc: { id: 'page-1' },
      req,
      viewType: 'list',
    });

    expect(url).toBe(`/collections/${pagesSlug}/page-1`);
    expect(requestCalls).toEqual(slotsSeen(['formatDocURL']));
  });

  it('admin locale filtering gives localization.filterAvailableLocales req.frogbot', async () => {
    const clientConfig = { localization: { localeCodes: ['en', 'es'], locales: [] } };

    expect(req).not.toHaveProperty('frogbot');

    await applyLocaleFiltering({
      clientConfig: clientConfig as never,
      config: booted.payload.config,
      req,
    });

    expect(clientConfig.localization.localeCodes).toEqual(['en']);
    expect(requestCalls).toEqual(slotsSeen(['filterAvailableLocales']));
  });

  it('serving an upload gives upload handlers req.frogbot after read access', async () => {
    const response = await fetch(`${booted.baseUrl}/api/${assetsSlug}/file/photo.png`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(assetHandlerResponse);
    expect(requestCalls).toEqual(slotsSeen(['assets.access.read', 'upload.handler']));
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
