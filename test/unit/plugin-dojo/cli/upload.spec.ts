import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeToken } from '../../../../packages/plugins/plugin-dojo/src/cli/auth.js';
import {
  formatBytes,
  snapshotKey,
  uploadData,
} from '../../../../packages/plugins/plugin-dojo/src/cli/data/upload.js';
import { createDojo } from '../../../../packages/plugins/plugin-dojo/src/cli/dojo.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeFiles } from './helpers.js';

async function setup({ isTTY = false } = {}) {
  const root = await tempDir();
  const dojo = await startFakeDojo();
  const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url };

  dojo.tokens.set('fb_stored', 100);
  dojo.projects.push({ id: 1, name: 'Deals', slug: 'deals', workspace: 1 });
  dojo.data.partSize = 1_000;
  await writeToken(env, dojo.url, 'fb_stored');

  const test = testIO({ cwd: root, env, isTTY });

  const upload = async (files: Record<string, string>, snapshot = 'snapshot') => {
    await writeFiles(root, { 'frogbot.db': snapshot });

    for (const [key, contents] of Object.entries(files)) {
      await writeFiles(root, { [key]: contents });
    }

    return uploadData({
      dojo: createDojo(test.io),
      appId: 1,
      inventory: {
        snapshotPath: join(root, 'frogbot.db'),
        files: Object.entries(files).map(([key, contents]) => ({
          key,
          path: join(root, key),
          size: Buffer.byteLength(contents),
        })),
      },
      io: test.io,
      retryDelays: [0, 0, 0],
    });
  };

  const puts = () => dojo.requests.filter((request) => request.method === 'PUT');

  return { dojo, upload, puts, ...test };
}

const md5 = (body: string) => `"${createHash('md5').update(body).digest('hex')}"`;

describe('uploadData', () => {
  it('sends a large object part by part, each request one part, and completes it in order', async () => {
    const { dojo, upload, puts } = await setup();
    const snapshot = 'a'.repeat(1_000) + 'b'.repeat(1_000) + 'c'.repeat(500);

    await upload({ 'files/deal.png': 'png', 'files/empty.txt': '' }, snapshot);

    expect(dojo.data.bucket).toEqual(
      new Map([
        ['files/deal.png', Buffer.from('png')],
        ['files/empty.txt', Buffer.from('')],
        [snapshotKey, Buffer.from(snapshot)],
      ]),
    );
    expect(puts().map((put) => put.body.length)).toEqual(
      expect.arrayContaining([1_000, 1_000, 500, 3, 0]),
    );
    expect(puts()).toHaveLength(5);

    for (const put of puts()) {
      expect(put.body.length).toBeLessThanOrEqual(dojo.data.partSize);
      expect(put.headers['content-length']).toBe(String(put.body.length));
      expect(put.headers.authorization).toBeUndefined();
    }

    expect(dojo.data.completed).toEqual([
      {
        key: snapshotKey,
        uploadId: 'upload-1',
        parts: [
          { partNumber: 1, etag: md5('a'.repeat(1_000)) },
          { partNumber: 2, etag: md5('b'.repeat(1_000)) },
          { partNumber: 3, etag: md5('c'.repeat(500)) },
        ],
      },
    ]);
    expect(dojo.paths().filter((path) => path.startsWith('POST'))).toEqual([
      'POST /api/apps/1/data-uploads',
      'POST /api/apps/1/data-uploads/complete',
    ]);
  });

  it('retries a part that fails twice and completes', async () => {
    const { dojo, upload, puts } = await setup();
    const snapshot = 'x'.repeat(2_500);

    dojo.data.failures.set(`${snapshotKey}#2`, 2);

    await upload({}, snapshot);

    expect(puts().filter((put) => put.search.endsWith('partNumber=2'))).toHaveLength(3);
    expect(dojo.data.bucket.get(snapshotKey)).toEqual(Buffer.from(snapshot));
  });

  it('fails naming the key once a part fails 4 times, without completing it', async () => {
    const { dojo, upload, puts } = await setup();

    dojo.data.failures.set(`${snapshotKey}#2`, 4);

    await expect(upload({}, 'x'.repeat(2_500))).rejects.toThrow(
      `Couldn't upload ${snapshotKey} (part 2 of 3): R2 answered 500. Run share again to resume; finished files are skipped.`,
    );
    expect(puts().filter((put) => put.search.endsWith('partNumber=2'))).toHaveLength(4);
    expect(dojo.data.completed).toEqual([]);
    expect(dojo.data.bucket.has(snapshotKey)).toBe(false);
  });

  it('fails naming a single file that fails 4 times', async () => {
    const { dojo, upload } = await setup();

    dojo.data.failures.set('files/deal.png', 4);

    await expect(upload({ 'files/deal.png': 'png' })).rejects.toThrow(
      "Couldn't upload files/deal.png: R2 answered 500.",
    );
  });

  it('skips files Dojo already holds at the same size on a rerun, and resends the snapshot it signs', async () => {
    const { dojo, upload, puts } = await setup();

    dojo.data.bucket.set('files/a.png', Buffer.from('aaa'));
    dojo.data.bucket.set('files/b.png', Buffer.from('old'));
    dojo.data.bucket.set(snapshotKey, Buffer.from('snapshot'));

    await upload({ 'files/a.png': 'aaa', 'files/b.png': 'newer' });

    expect(
      puts()
        .map((put) => put.path)
        .sort(),
    ).toEqual([
      `/bucket/${snapshotKey.split('/').map(encodeURIComponent).join('/')}`,
      '/bucket/files/b.png',
    ]);
    expect(dojo.data.bucket.get('files/b.png')).toEqual(Buffer.from('newer'));
  });

  it("stops with Dojo's words when the app has already started", async () => {
    const { dojo, upload, puts } = await setup();

    dojo.data.started = true;

    await expect(upload({ 'files/a.png': 'aaa' })).rejects.toThrow(
      "Couldn't start the data upload: This app has already started, so share can no longer bring data to it.",
    );
    expect(puts()).toEqual([]);
  });

  it('prints progress only at each 10% without a terminal', async () => {
    const { upload, stdout } = await setup();
    const files = Object.fromEntries(
      Array.from({ length: 19 }, (_, index) => [`files/${index}.txt`, 'f'.repeat(50)]),
    );

    await upload(files, 's'.repeat(50));

    expect(stdout()).toEqual(
      Array.from(
        { length: 10 },
        (_, index) => `[frogbot] Uploading data: ${formatBytes((index + 1) * 100)} of 1.0 KB`,
      ),
    );
  });

  it('keeps progress on one line in a terminal', async () => {
    const { upload, stdout } = await setup({ isTTY: true });

    await upload({ 'files/a.txt': 'a'.repeat(500) }, 's'.repeat(500));

    const [line, ...rest] = stdout();
    const shown = line?.split('\r').map((text) => text.replace('\u001b[K', ''));

    expect(rest).toEqual([]);
    expect(shown?.[0]).toBe('[frogbot] Uploading data: 0 B of 1.0 KB');
    expect(shown?.at(-1)).toBe('[frogbot] Uploading data: 1.0 KB of 1.0 KB');
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1_000, '1.0 KB'],
    [999_960, '1.0 MB'],
    [1_200_000_000, '1.2 GB'],
    [13_400_000_000, '13.4 GB'],
    [2_000_000_000_000, '2.0 TB'],
  ])('%d is %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});
