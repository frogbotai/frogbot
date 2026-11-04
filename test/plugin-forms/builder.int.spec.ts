import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FormDocument, FormMode } from '@frogbotai/plugin-forms';
import { FormPreviewView } from '@frogbotai/plugin-forms/rsc';
import { type AdminViewServerProps, getAccessResults } from 'payload';
import { isValidElement, type ReactElement } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  fieldRefusal,
  type FormFieldInfo,
  missingRequired,
} from '../../packages/plugins/plugin-forms/src/definition.js';
import { loadRuntime } from '../../packages/plugins/plugin-forms/src/lookup.js';
import { listQuestionFields } from '../../packages/plugins/plugin-forms/src/questions.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { leadsSlug, ticketsSlug, viewerName } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';

type SaveError = { path: string; message: string };

describe(`form builder field lists [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;
  let saved = 0;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  async function fieldsOf(slug: string): Promise<FormFieldInfo[]> {
    const runtime = await loadRuntime(booted.frogbot);
    const target = runtime?.targets.get(slug);
    if (!runtime || !target) throw new Error(`No forms target ${slug}`);

    const req = await booted.frogbot.createRequest({});

    return listQuestionFields({ target, targets: runtime.targets, req });
  }

  async function save(collection: string, mode: FormMode, fields: string[]): Promise<SaveError[]> {
    saved += 1;

    try {
      await booted.frogbot.create({
        collection: 'forms',
        data: {
          title: `Form ${saved}`,
          slug: `builder-${saved}`,
          collection,
          mode,
          steps: [{ questions: fields.map((field) => ({ field })) }],
        } satisfies Omit<FormDocument, 'id'>,
        overrideAccess: true,
      });
    } catch (error) {
      const errors = (error as { data?: { errors?: SaveError[] } }).data?.errors;
      if (!errors) throw error;

      return errors.map(({ path, message }) => ({ path, message }));
    }

    return [];
  }

  it('lists the leads fields saving accepts and refuses, with reasons', async () => {
    const byName = Object.fromEntries((await fieldsOf(leadsSlug)).map((info) => [info.name, info]));

    expect(Object.keys(byName)).toEqual([
      'email',
      'firstName',
      'lastName',
      'interest',
      'source',
      'priority',
      'internalNote',
      'meta',
    ]);

    expect(byName.email).toMatchObject({ type: 'email', required: true, hasDefault: false });
    expect(byName.priority).toMatchObject({ required: true, hasDefault: true });
    expect(byName.interest).toMatchObject({
      type: 'select',
      options: [
        { label: 'sales', value: 'sales' },
        { label: 'support', value: 'support' },
        { label: 'partnership', value: 'partnership' },
      ],
    });

    expect(byName.internalNote).toMatchObject({
      createRefusal: expect.stringContaining('create access denies form submissions'),
    });

    expect(byName.meta).toMatchObject({ refusal: expect.stringContaining('has type json') });
  });

  it('marks file questions usable for creating forms only', async () => {
    const screenshot = (await fieldsOf(ticketsSlug)).find(({ name }) => name === 'screenshot');

    expect(screenshot).toMatchObject({ type: 'upload' });
    expect(screenshot).not.toHaveProperty('createRefusal');
    expect(screenshot).toMatchObject({ editRefusal: expect.stringContaining('file question') });
  });

  it.each([leadsSlug, ticketsSlug])(
    'matches what saving accepts and refuses for every %s field in every mode',
    async (slug) => {
      const list = await fieldsOf(slug);

      for (const mode of ['create', 'update', 'both'] as const) {
        for (const info of list) {
          const required = missingRequired(list, new Set([info.name]), mode).map(
            ({ name }) => name,
          );

          const reason = fieldRefusal(info, mode);

          expect(await save(slug, mode, [info.name, ...required]), `${mode} ${info.name}`).toEqual(
            reason
              ? [{ path: 'steps.0.questions.0.field', message: `"${info.name}" ${reason}.` }]
              : [],
          );
        }
      }
    },
  );

  it('refuses a creating form that leaves out a required field with no default', async () => {
    const list = await fieldsOf(leadsSlug);

    expect(missingRequired(list, new Set(['firstName']), 'create').map(({ name }) => name)).toEqual(
      ['email'],
    );

    expect(await save(leadsSlug, 'create', ['firstName'])).toEqual([
      expect.objectContaining({ path: 'steps', message: expect.stringContaining('"email"') }),
    ]);

    expect(await save(leadsSlug, 'update', ['firstName'])).toEqual([]);
  });

  describe('/forms-preview', () => {
    const notFound = () => {
      throw new Error('not found');
    };

    async function preview(user?: { id: number; name: string }) {
      const req = await booted.frogbot.createRequest(
        user ? { user: { ...user, collection: 'users' } } : {},
      );

      const permissions = await getAccessResults({ req });

      return FormPreviewView({
        initPageResult: { permissions, req },
        payload: req.payload,
        server: { notFound },
      } as unknown as AdminViewServerProps);
    }

    it('is not found signed out', async () => {
      await expect(preview()).rejects.toThrow('not found');
    });

    it('is not found for a user who can neither create nor update forms', async () => {
      await expect(preview({ id: 1, name: viewerName })).rejects.toThrow('not found');
    });

    it("gives a forms editor the targets' field lists", async () => {
      const element = await preview({ id: 2, name: 'editor' });

      expect(isValidElement(element)).toBe(true);

      const { fields } = (element as ReactElement<{ fields: Record<string, FormFieldInfo[]> }>)
        .props;

      expect(Object.keys(fields)).toEqual([leadsSlug, ticketsSlug, 'ticket-files']);
      expect(fields[leadsSlug]?.map(({ name }) => name)).toContain('email');
    });
  });
});
