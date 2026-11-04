import type { CollectionConfig, Field, FrogBot, FrogBotConfig, FrogBotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import {
  buildDefinition,
  DEFAULT_UPLOAD_LIMITS,
} from '../../../packages/plugins/plugin-forms/src/definition.js';
import { formsPlugin } from '../../../packages/plugins/plugin-forms/src/index.js';
import {
  checkForm,
  collectFields,
  describeFields,
  type FormTarget,
} from '../../../packages/plugins/plugin-forms/src/questions.js';
import type {
  FormDocument,
  FormQuestionConfig,
} from '../../../packages/plugins/plugin-forms/src/types.js';
import {
  checkFiles,
  matchesMimeType,
  resolveUploadLimits,
  uploadQuestions,
} from '../../../packages/plugins/plugin-forms/src/uploads.js';

const MiB = 1024 * 1024;

const ticketFields: Field[] = [
  { name: 'subject', type: 'text', required: true },
  { name: 'screenshot', type: 'upload', relationTo: 'ticket-files' },
  { name: 'attachments', type: 'upload', relationTo: 'ticket-files', hasMany: true },
  { name: 'avatar', type: 'upload', relationTo: 'avatars' },
  { name: 'either', type: 'upload', relationTo: ['ticket-files', 'avatars'] },
] as Field[];

const tickets: FormTarget = { slug: 'tickets', fields: collectFields(ticketFields) };

const ticketFiles: FormTarget = {
  slug: 'ticket-files',
  upload: true,
  fields: collectFields([{ name: 'note', type: 'text' }] as Field[]),
};

const strictFiles: FormTarget = {
  slug: 'ticket-files',
  upload: true,
  fields: collectFields([{ name: 'alt', type: 'text', required: true }] as Field[]),
};

const targets = new Map([
  ['tickets', tickets],
  ['ticket-files', ticketFiles],
]);

const req = { user: null, context: {} } as unknown as FrogBotRequest;

function form(questions: FormQuestionConfig[]): Partial<FormDocument> {
  return {
    slug: 'support',
    collection: 'tickets',
    steps: [{ questions: [{ field: 'subject' }, ...questions] }],
  };
}

describe('file questions when a form is saved', () => {
  it('accepts upload fields into a listed upload collection within the default limits', async () => {
    expect(
      await checkForm({
        form: form([
          { field: 'screenshot', maxFileSize: 10 * MiB },
          { field: 'attachments', maxFiles: 2, maxFileSize: 10 * MiB, mimeTypes: ['image/*'] },
        ]),
        targets,
        req,
      }),
    ).toEqual([]);
  });

  it("refuses a file larger than the app's per-file limit, naming the key", async () => {
    expect(
      await checkForm({
        form: form([{ field: 'screenshot', maxFileSize: 50 * MiB }]),
        targets,
        req,
      }),
    ).toEqual([
      {
        path: 'steps.0.questions.1.maxFileSize',
        message:
          '"screenshot" accepts files up to 50 MB, over the app\'s 20 MB per-file upload limit. Raise upload.limits.fileSize in the config, or lower maxFileSize.',
      },
    ]);

    expect(
      await checkForm({
        form: form([{ field: 'screenshot', maxFileSize: 50 * MiB }]),
        targets,
        req,
        limits: { fileSize: 60 * MiB, files: 3, requestSize: 80 * MiB },
      }),
    ).toEqual([]);
  });

  it('refuses questions that together pass the per-request file count or size', async () => {
    const errors = await checkForm({
      form: form([
        { field: 'screenshot' },
        { field: 'attachments', maxFiles: 3, maxFileSize: 10 * MiB },
      ]),
      targets,
      req,
    });

    expect(errors).toEqual([
      {
        path: 'steps',
        message: expect.stringMatching(/^"screenshot", "attachments" take up to 4 files together/),
      },
      {
        path: 'steps',
        message: expect.stringMatching(/take up to 50 MB of files together, over the app's 50 MB/),
      },
    ]);
  });

  it('refuses bad maxFiles, bad types, unlisted or strict collections and mixed relations', async () => {
    const errors = await checkForm({
      form: form([
        { field: 'screenshot', maxFiles: 2 },
        { field: 'attachments', maxFiles: 6, mimeTypes: ['pdf'] },
        { field: 'avatar' },
        { field: 'either' },
      ]),
      targets,
      req,
    });

    expect(errors).toEqual([
      expect.objectContaining({
        path: 'steps.0.questions.1.maxFiles',
        message: expect.stringContaining('"screenshot" holds one file'),
      }),
      expect.objectContaining({
        path: 'steps.0.questions.2.maxFiles',
        message: '"attachments": maxFiles must be a whole number from 1 to 5.',
      }),
      expect.objectContaining({
        path: 'steps.0.questions.2.mimeTypes',
        message: expect.stringContaining('"pdf" isn\'t a file type'),
      }),
      expect.objectContaining({
        path: 'steps.0.questions.3.field',
        message: expect.stringContaining('"avatar" stores files in avatars, which isn\'t'),
      }),
      expect.objectContaining({
        path: 'steps.0.questions.4.field',
        message: expect.stringContaining('takes files from several collections'),
      }),
    ]);

    expect(
      await checkForm({
        form: form([{ field: 'screenshot' }]),
        targets: new Map([
          ['tickets', tickets],
          ['ticket-files', strictFiles],
        ]),
        req,
      }),
    ).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('which requires "alt" with no default'),
      }),
    ]);
  });

  it('refuses a file field as a hidden parameter', async () => {
    const errors = await checkForm({
      form: { ...form([]), hiddenParams: [{ name: 'file', field: 'screenshot' }] },
      targets,
      req,
    });

    expect(errors).toEqual([expect.objectContaining({ path: 'hiddenParams.0.field' })]);
  });
});

describe('file questions in the definition', () => {
  it('sends the count, size and types, defaulting to one file at the app limit', () => {
    const definition = buildDefinition({
      form: {
        ...(form([
          { field: 'screenshot' },
          { field: 'attachments', maxFiles: 2, maxFileSize: MiB, mimeTypes: ['image/*'] },
        ]) as FormDocument),
        id: 1,
        title: 'Support',
      },
      fields: describeFields(tickets),
      closed: false,
    });

    expect(definition.steps[0]?.questions.slice(1)).toEqual([
      {
        key: 'screenshot',
        type: 'upload',
        label: 'Screenshot',
        required: false,
        maxFiles: 1,
        maxFileSize: DEFAULT_UPLOAD_LIMITS.fileSize,
      },
      {
        key: 'attachments',
        type: 'upload',
        label: 'Attachments',
        required: false,
        hasMany: true,
        maxFiles: 2,
        maxFileSize: MiB,
        mimeTypes: ['image/*'],
      },
    ]);
  });
});

describe('files on submit', () => {
  const saved = { ...form([{ field: 'attachments', maxFiles: 2, maxFileSize: 10 }]), id: 1 };
  const questions = uploadQuestions(saved as FormDocument, tickets, DEFAULT_UPLOAD_LIMITS);
  const file = (name: string, size = 5, mimetype = 'text/plain') => ({
    name,
    size,
    mimetype,
    data: Buffer.alloc(size),
  });

  it('refuses IDs, too many files and files that are too large', () => {
    expect(checkFiles(questions, { attachments: [4] }, {})).toEqual([
      { field: 'attachments', message: "Attach the file itself. File IDs aren't accepted." },
    ]);
    expect(checkFiles(questions, {}, { attachments: [file('a'), file('b'), file('c')] })).toEqual([
      { field: 'attachments', message: 'Attach up to 2 files.' },
    ]);
    expect(checkFiles(questions, {}, { attachments: file('big', 11) })).toEqual([
      { field: 'attachments', message: '"big" is larger than 1 KB.' },
    ]);
    expect(checkFiles(questions, { attachments: [] }, { attachments: file('ok') })).toEqual([]);
  });

  it('matches exact types and wildcards, case-insensitively', () => {
    expect(matchesMimeType('image/PNG', ['image/*'])).toBe(true);
    expect(matchesMimeType('application/pdfx', ['application/pdf'])).toBe(false);
    expect(matchesMimeType('text/plain', [])).toBe(true);
  });

  it("reads the app's limits as Payload merges them", () => {
    expect(resolveUploadLimits({})).toEqual(DEFAULT_UPLOAD_LIMITS);
    expect(
      resolveUploadLimits({
        bodyParser: { limits: { files: 9 } },
        upload: { limits: { fileSize: 60 * MiB }, requestSizeLimit: Infinity },
      }),
    ).toEqual({ fileSize: 60 * MiB, files: 3, requestSize: Infinity });
  });
});

describe('the scanning warning', () => {
  const files = (hooks?: CollectionConfig['hooks']): CollectionConfig => ({
    slug: 'ticket-files',
    upload: true,
    ...(hooks ? { hooks } : {}),
    fields: [],
  });

  async function warnings(collections: CollectionConfig[]) {
    const warn = vi.fn();
    const result = await formsPlugin({
      collections: collections.map(({ slug }) => slug),
      trustProxy: true,
    })({ secret: 'test', db: {}, collections } as unknown as FrogBotConfig);

    for (const hook of [result.onInit ?? []].flat()) {
      await hook({ logger: { warn } } as unknown as FrogBot);
    }

    return warn.mock.calls.map(([message]) => message as string);
  }

  it('warns once for a listed upload collection with no beforeChange hook', async () => {
    expect(await warnings([files()])).toEqual([
      expect.stringContaining(
        "'ticket-files' takes files from public forms but has no beforeChange hook",
      ),
    ]);
    expect(await warnings([files({ beforeChange: [({ data }) => data] })])).toEqual([]);
    expect(await warnings([{ slug: 'leads', fields: [{ name: 'email', type: 'email' }] }])).toEqual(
      [],
    );
  });
});
