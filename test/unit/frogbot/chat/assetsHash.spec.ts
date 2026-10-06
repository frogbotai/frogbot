import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  defaultChatAssetsCollection,
  SKIP_ASSET_TEXT_CONTEXT_KEY,
} from '../../../../packages/frogbot/src/chat/collections/assets.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';
import { reportDocx, reportText } from '../../../__helpers/shared/office.js';

const collection = defaultChatAssetsCollection({ chatsSlug: 'chats', userSlug: 'users' });
const [hook] = collection.hooks!.beforeChange!;

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

async function run({
  data = {},
  file,
  context = {},
  operation = 'create',
}: {
  data?: Record<string, unknown>;
  file?: { data: Buffer; tempFilePath?: string; name?: string; mimetype?: string };
  context?: Record<string, unknown>;
  operation?: 'create' | 'update';
}) {
  return hook({
    collection,
    data,
    req: { file, context } as unknown as FrogBotRequest,
    operation,
  } as never);
}

describe('chat assets content hash', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });

    directory = undefined;
  });

  it('declares a hidden text field for the hash', () => {
    const field = collection.fields.find((entry) => 'name' in entry && entry.name === 'sha256');

    expect(field).toEqual({ name: 'sha256', type: 'text', hidden: true });
  });

  it('hashes the uploaded file data', async () => {
    const result = await run({ file: { data: Buffer.from('hello') } });

    expect(result).toEqual({ sha256: sha256('hello'), text: null });
  });

  it('streams the temp file when the upload data is empty', async () => {
    directory = await mkdtemp(join(tmpdir(), 'frogbot-assets-hash-'));

    const tempFilePath = join(directory, 'upload');

    await writeFile(tempFilePath, 'from disk');

    const result = await run({ file: { data: Buffer.alloc(0), tempFilePath } });

    expect(result).toEqual({ sha256: sha256('from disk'), text: null });
  });

  it('hashes an empty file', async () => {
    const result = await run({ file: { data: Buffer.alloc(0) } });

    expect(result).toEqual({ sha256: sha256(''), text: null });
  });

  it('stores no hash without an uploaded file', async () => {
    const result = await run({ data: { chat: 'chat-1' } });

    expect(result).toEqual({ chat: 'chat-1', sha256: undefined, text: null });
  });

  it('overwrites a hash sent by the client', async () => {
    const forged = sha256('someone else');

    const withFile = await run({
      data: { sha256: forged },
      file: { data: Buffer.from('hello') },
    });
    const withoutFile = await run({ data: { sha256: forged } });

    expect(withFile).toEqual({ sha256: sha256('hello'), text: null });
    expect(withoutFile).toEqual({ sha256: undefined, text: null });
  });

  it('reads a Word document from the temp file when the upload data is empty', async () => {
    directory = await mkdtemp(join(tmpdir(), 'frogbot-assets-hash-'));

    const tempFilePath = join(directory, 'upload');
    const bytes = reportDocx();

    await writeFile(tempFilePath, bytes);

    const result = await run({
      file: { data: Buffer.alloc(0), tempFilePath, name: 'report.docx', mimetype: DOCX_TYPE },
    });

    expect(result).toEqual({ sha256: sha256(bytes), text: reportText });
  });

  it('refuses an unreadable Word document from the temp file', async () => {
    directory = await mkdtemp(join(tmpdir(), 'frogbot-assets-hash-'));

    const tempFilePath = join(directory, 'upload');

    await writeFile(tempFilePath, '%PDF-1.7\n%%EOF\n');

    const result = run({
      file: { data: Buffer.alloc(0), tempFilePath, name: 'scan.docx', mimetype: DOCX_TYPE },
    });

    await expect(result).rejects.toMatchObject({
      name: 'ValidationError',
      data: {
        errors: [
          {
            path: 'file',
            message: "scan.docx couldn't be read: it isn't a valid Word or Excel file.",
          },
        ],
      },
    });
  });

  it('stores no text for a Word document when the request opts out', async () => {
    const result = await run({
      file: { data: Buffer.from('not a zip'), name: 'saved.docx', mimetype: DOCX_TYPE },
      context: { [SKIP_ASSET_TEXT_CONTEXT_KEY]: true },
    });

    expect(result).toEqual({ sha256: sha256('not a zip'), text: null });
  });

  it('leaves the stored text alone on update', async () => {
    const result = await run({ data: { chat: 'chat-1' }, operation: 'update' });

    expect(result).toEqual({ chat: 'chat-1', sha256: undefined });
  });
});
