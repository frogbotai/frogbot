import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { defaultChatAssetsCollection } from '../../../../packages/frogbot/src/chat/collections/assets.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

const collection = defaultChatAssetsCollection({ chatsSlug: 'chats', userSlug: 'users' });
const [hook] = collection.hooks!.beforeChange!;

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function run({
  data = {},
  file,
}: {
  data?: Record<string, unknown>;
  file?: { data: Buffer; tempFilePath?: string };
}) {
  return hook!({
    data,
    req: { file } as unknown as FrogBotRequest,
    operation: 'create',
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

    expect(result).toEqual({ sha256: sha256('hello') });
  });

  it('streams the temp file when the upload data is empty', async () => {
    directory = await mkdtemp(join(tmpdir(), 'frogbot-assets-hash-'));

    const tempFilePath = join(directory, 'upload');

    await writeFile(tempFilePath, 'from disk');

    const result = await run({ file: { data: Buffer.alloc(0), tempFilePath } });

    expect(result).toEqual({ sha256: sha256('from disk') });
  });

  it('hashes an empty file', async () => {
    const result = await run({ file: { data: Buffer.alloc(0) } });

    expect(result).toEqual({ sha256: sha256('') });
  });

  it('stores no hash without an uploaded file', async () => {
    const result = await run({ data: { chat: 'chat-1' } });

    expect(result).toEqual({ chat: 'chat-1', sha256: undefined });
  });

  it('overwrites a hash sent by the client', async () => {
    const forged = sha256('someone else');

    const withFile = await run({
      data: { sha256: forged },
      file: { data: Buffer.from('hello') },
    });
    const withoutFile = await run({ data: { sha256: forged } });

    expect(withFile).toEqual({ sha256: sha256('hello') });
    expect(withoutFile).toEqual({ sha256: undefined });
  });
});
