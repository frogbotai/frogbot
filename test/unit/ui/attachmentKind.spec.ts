import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { attachmentKind as serverKind } from '../../../packages/frogbot/src/uploads/attachmentParts.js';
import {
  acceptFor,
  attachmentKind,
  BLOCKED_EXTENSIONS,
  BLOCKED_TYPES,
  extensionLabel,
  isUploadBlocked,
  kindFrom,
  TEXT_EXTENSIONS,
  typeLabel,
} from '../../../packages/ui/src/chat/attachment-kind.js';
import { attachmentKindCases } from '../frogbot/uploads/attachmentKindCases.js';

type RestrictedType = { extensions: string[]; mimeType: string };

async function payloadRestrictions(): Promise<RestrictedType[]> {
  const requireFromFrogBot = createRequire(path.resolve('packages/frogbot/package.json'));
  const payloadEntry = requireFromFrogBot.resolve('payload');
  const modulePath = path.join(path.dirname(payloadEntry), 'uploads/checkFileRestrictions.js');
  const restrictions = await import(pathToFileURL(modulePath).href);

  return restrictions.RESTRICTED_FILE_EXT_AND_TYPES;
}

function accepted(modelInputs?: Parameters<typeof acceptFor>[0]) {
  return acceptFor(modelInputs).split(',');
}

describe('browser attachment kinds', () => {
  it.each(attachmentKindCases)(
    'classifies $name as $kind, like the server',
    ({ kind, ...file }) => {
      expect(kindFrom(file)).toBe(kind);
      expect(serverKind(file)).toBe(kind);
    },
  );

  it.each(attachmentKindCases.filter((entry) => entry.head))(
    'classifies a picked $name file as $kind',
    async ({ filename, head, kind, mediaType }) => {
      const file = new File([head!], filename, { type: mediaType });

      expect(await attachmentKind(file)).toBe(kind);
    },
  );

  it.each([...TEXT_EXTENSIONS])('treats .%s as text on both sides', (extension) => {
    const file = { mediaType: '', filename: `file.${extension}` };

    expect(kindFrom(file)).toBe('text');
    expect(serverKind(file)).toBe('text');
  });

  it('reads no contents when the type is certain', async () => {
    const file = new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' });
    const slice = vi.spyOn(file, 'slice');

    expect(await attachmentKind(file)).toBe('pdf');
    expect(slice).not.toHaveBeenCalled();
  });

  it('reads only the first 4 KB when the type is uncertain', async () => {
    const file = new File(['a'.repeat(5000), '\u0000'], 'notes.txt', { type: 'text/plain' });
    const slice = vi.spyOn(file, 'slice');

    expect(await attachmentKind(file)).toBe('text');
    expect(slice).toHaveBeenCalledWith(0, 4096);
  });

  it('classifies a misleading name by its contents', async () => {
    const photo = new File(['just words'], 'photo.heic', { type: 'image/heic' });
    const notes = new File(['hello\u0000world'], 'notes.txt', { type: 'text/plain' });

    expect(await attachmentKind(photo)).toBe('text');
    expect(await attachmentKind(notes)).toBe('binary');
  });
});

describe('isUploadBlocked', () => {
  it('matches the upload restrictions the server applies', async () => {
    const restrictions = await payloadRestrictions();

    const extensions = new Set(restrictions.flatMap((entry) => entry.extensions));
    const types = new Set(restrictions.map((entry) => entry.mimeType));

    expect([...BLOCKED_EXTENSIONS].sort()).toEqual([...extensions].sort());
    expect([...BLOCKED_TYPES].sort()).toEqual([...types].sort());
  });

  it.each([
    { name: 'app.js', type: 'text/javascript' },
    { name: 'main.py', type: '' },
    { name: 'page.HTML', type: 'text/html' },
    { name: 'module.mjs', type: 'text/javascript' },
    { name: 'script', type: 'text/x-perl' },
    { name: 'setup.exe', type: 'application/x-msdownload' },
  ])('blocks $name ($type)', (file) => {
    expect(isUploadBlocked(file)).toBe(true);
  });

  it.each([
    { name: 'notes.md', type: 'text/markdown' },
    { name: 'index.ts', type: 'video/mp2t' },
    { name: 'app.js.txt', type: 'text/plain' },
    { name: 'photo.png', type: 'image/png' },
  ])('allows $name ($type)', (file) => {
    expect(isUploadBlocked(file)).toBe(false);
  });
});

describe('typeLabel', () => {
  it.each([
    { filename: 'app.js', label: 'JS' },
    { filename: 'notes.md', label: 'MD' },
    { filename: 'data.csv', label: 'CSV' },
    { filename: 'data.json', label: 'JSON' },
    { filename: 'config.yaml', label: 'YAML' },
    { filename: 'Dockerfile', label: 'TEXT' },
    { filename: 'schema.graphql', label: 'TEXT' },
    { filename: undefined, label: 'TEXT' },
  ])('labels $filename as $label', ({ filename, label }) => {
    expect(typeLabel({ filename })).toBe(label);
  });

  it('labels pastes PASTED whatever their name', () => {
    expect(typeLabel({ filename: 'pasted-1.txt', origin: 'paste' })).toBe('PASTED');
  });
});

describe('extensionLabel', () => {
  it.each([
    { filename: 'report.pdf', label: 'PDF' },
    { filename: 'clip.webm', label: 'WEBM' },
    { filename: 'archive.zip', label: 'ZIP' },
    { filename: 'model.safetensors', label: undefined },
    { filename: 'README', label: undefined },
    { filename: undefined, label: undefined },
  ])('labels $filename as $label', ({ filename, label }) => {
    expect(extensionLabel(filename)).toBe(label);
  });
});

describe('acceptFor', () => {
  it('accepts text and no media for a text-only model', () => {
    const accept = accepted(['text']);

    expect(accept).toEqual(expect.arrayContaining(['text/*', 'application/json', '.js', '.md']));
    expect(accept).not.toContain('image/png');
    expect(accept).not.toContain('application/pdf');
    expect(accept).not.toContain('audio/*');
    expect(accept).not.toContain('video/*');
  });

  it('accepts text, images and PDFs for a model that reads them', () => {
    const accept = accepted(['text', 'image', 'pdf']);

    expect(accept).toEqual(
      expect.arrayContaining(['text/*', 'image/png', 'image/webp', 'application/pdf', '.pdf']),
    );
    expect(accept).not.toContain('audio/*');
    expect(accept).not.toContain('video/*');
    expect(accept).not.toContain('image/heic');
  });

  it('accepts text and every media kind when the model is unknown', () => {
    const accept = accepted();

    expect(accept).toEqual(
      expect.arrayContaining(['text/*', 'image/jpeg', 'audio/*', 'video/*', 'application/pdf']),
    );
  });
});
