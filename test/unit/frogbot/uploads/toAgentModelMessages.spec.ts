import type { ModelMessage, UIMessage } from 'ai';
import type * as Payload from 'payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';
import { toAgentModelMessages } from '../../../../packages/frogbot/src/uploads/toAgentModelMessages.js';
import {
  budgetText,
  budgetXlsx,
  encryptedOfficeFile,
  reportDocx,
  reportText,
} from '../../../__helpers/shared/office.js';

const { getFileByPath } = vi.hoisted(() => ({ getFileByPath: vi.fn() }));

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof Payload>()),
  getFileByPath,
}));

const MiB = 1024 * 1024;

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const ai = {
  providers: {
    test: {
      type: 'openai-compatible',
      baseUrl: 'http://localhost:3988/v1',
      models: [
        { id: 'media', mode: 'chat', modalities: { input: ['text', 'image', 'pdf'] } },
        { id: 'text-only', mode: 'chat', modalities: { input: ['text'] } },
      ],
    },
  },
  routers: {},
};

type Asset = {
  id: string | number;
  filename?: string;
  mimeType?: string;
  filesize?: number;
  sha256?: string | null;
  text?: string | null;
  chat?: string | number | null;
  prefix?: string;
};

function request({
  findByID = vi.fn(),
  update = vi.fn(),
  upload = { staticDir: '/files' },
  chat = { enabled: true, chatsSlug: 'chats', messagesSlug: 'messages', assetsSlug: 'assets' },
  createRequest = vi.fn().mockResolvedValue({ headers: new Headers(), handler: true }),
  logger = { warn: vi.fn() },
  transactionID,
}: {
  findByID?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  upload?: Record<string, unknown>;
  chat?: Record<string, unknown>;
  createRequest?: ReturnType<typeof vi.fn>;
  logger?: { warn: ReturnType<typeof vi.fn> };
  transactionID?: string;
} = {}) {
  return Object.assign(
    new Request('http://localhost/api/agents/support', {
      headers: { authorization: 'Bearer token', cookie: 'session=one' },
    }),
    {
      user: { id: 'user-1' },
      context: {},
      transactionID,
      frogbot: {
        config: {
          ai,
          chat,
          _internal: {
            payloadConfig: Promise.resolve({ collections: [{ slug: 'assets', upload }] }),
          },
        },
        createRequest,
        findByID,
        update,
        logger,
      },
    },
  ) as unknown as FrogBotRequest;
}

function assets(...docs: Asset[]) {
  return vi.fn(({ id }: { id: string | number }) => {
    const doc = docs.find((entry) => entry.id === id);

    if (!doc) return Promise.reject(Object.assign(new Error('Not Found'), { status: 404 }));

    return Promise.resolve(doc);
  });
}

function reference(id: string | number, extra: Record<string, unknown> = {}) {
  return { type: 'file-reference', id, ...extra } as unknown as UIMessage['parts'][number];
}

function user(...parts: UIMessage['parts']): UIMessage {
  return { id: `m-${Math.random()}`, role: 'user', parts };
}

function storedFiles(files: Record<string, string | Buffer>) {
  getFileByPath.mockImplementation((filePath: string) => {
    const name = filePath.replace('/files/', '');
    const content = files[name];

    if (content === undefined) return Promise.reject(new Error('ENOENT'));

    return Promise.resolve({ data: Buffer.isBuffer(content) ? content : Buffer.from(content) });
  });
}

function load(
  req: FrogBotRequest,
  messages: UIMessage[],
  options: { model?: string; chatId?: string; onUnavailable?: 'throw' | 'marker' } = {},
) {
  return toAgentModelMessages({
    req,
    messages,
    tools: {},
    model: options.model ?? 'test/media',
    chatId: options.chatId,
    onUnavailable: options.onUnavailable ?? 'throw',
  });
}

function contentOf(messages: ModelMessage[]): unknown[] {
  return messages.flatMap((message) => message.content as unknown[]);
}

function texts(messages: ModelMessage[]): string[] {
  return contentOf(messages).flatMap((part) =>
    (part as { type: string }).type === 'text' ? [(part as { text: string }).text] : [],
  );
}

const png = { mimeType: 'image/png', filesize: 4 };

const docx = { mimeType: DOCX_TYPE, filesize: 2048 };

describe('toAgentModelMessages', () => {
  beforeEach(() => {
    getFileByPath.mockReset();
    vi.unstubAllGlobals();
  });

  it('authorizes IDs with hidden fields and converts files for the model', async () => {
    const findByID = assets(
      { id: 'note', filename: 'notes.md', mimeType: 'text/markdown', filesize: 5 },
      { id: 'logo', filename: 'logo.png', ...png },
    );
    const req = request({ findByID });

    storedFiles({ 'notes.md': '# Hi\n', 'logo.png': 'PNG!' });

    const messages = await load(req, [
      user({ type: 'text', text: 'Read these' }, reference('note'), reference('logo')),
    ]);

    expect(findByID).toHaveBeenCalledWith({
      collection: 'assets',
      id: 'note',
      depth: 0,
      req,
      overrideAccess: false,
      showHiddenFields: true,
    });
    expect(getFileByPath).toHaveBeenCalledWith('/files/notes.md');
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Read these' },
          { type: 'text', text: 'Attached file "notes.md":\n# Hi\n' },
          {
            type: 'file',
            filename: 'logo.png',
            mediaType: 'image/png',
            data: { type: 'url', url: new URL('data:image/png;base64,UE5HIQ==') },
          },
        ],
      },
    ]);
  });

  it('labels text with the name the user saw, not the stored name', async () => {
    const req = request({
      findByID: assets({ id: 'code', filename: 'app.js-1.txt', mimeType: 'text/plain' }),
    });

    storedFiles({ 'app.js-1.txt': 'export {};' });

    const messages = await load(req, [user(reference('code', { filename: 'app.js' }))]);

    expect(texts(messages)).toEqual(['Attached file "app.js":\nexport {};']);
  });

  it('labels pasted text assets as pastes', async () => {
    const req = request({
      findByID: assets({ id: 'paste', filename: 'pasted-1.txt', mimeType: 'text/plain' }),
    });

    storedFiles({ 'pasted-1.txt': 'A long paste' });

    const messages = await load(req, [
      user(reference('paste', { filename: 'Pasted text', origin: 'paste' })),
    ]);

    expect(texts(messages)).toEqual(['Pasted text:\nA long paste']);
  });

  it('converts legacy inline pastes into labelled text', async () => {
    const findByID = vi.fn();

    const messages = await load(request({ findByID, chat: { enabled: false } }), [
      user(
        { type: 'data-paste', data: { text: 'Inline paste', filename: 'pasted.txt' } } as never,
        { type: 'text', text: 'What is this?' },
      ),
    ]);

    expect(texts(messages)).toEqual(['Pasted text:\nInline paste', 'What is this?']);
    expect(findByID).not.toHaveBeenCalled();
  });

  it('reads text contents even when the recorded type says video', async () => {
    const req = request({
      findByID: assets({ id: 'ts', filename: 'index.ts', mimeType: 'video/mp2t' }),
    });

    storedFiles({ 'index.ts': 'const a = 1;' });

    const messages = await load(req, [user(reference('ts'))]);

    expect(texts(messages)).toEqual(['Attached file "index.ts":\nconst a = 1;']);
  });

  it('sends a PDF stored without a specific type as a PDF', async () => {
    const req = request({
      findByID: assets({ id: 'pdf', filename: 'report.pdf', mimeType: 'application/octet-stream' }),
    });

    storedFiles({ 'report.pdf': '%PDF' });

    const messages = await load(req, [user(reference('pdf'))]);

    expect(contentOf(messages)).toEqual([
      {
        type: 'file',
        filename: 'report.pdf',
        mediaType: 'application/pdf',
        data: { type: 'url', url: new URL('data:application/pdf;base64,JVBERg==') },
      },
    ]);
  });

  it('links unclaimed assets to the current chat once and leaves claimed ones alone', async () => {
    const update = vi.fn().mockResolvedValue({});
    const req = request({
      findByID: assets(
        { id: 'a', filename: 'a.txt', mimeType: 'text/plain', chat: null },
        { id: 'b', filename: 'b.txt', mimeType: 'text/plain', chat: 'c' },
      ),
      update,
    });

    storedFiles({ 'a.txt': 'x', 'b.txt': 'y' });

    await load(req, [user(reference('a'), reference('b'), reference('a'))], { chatId: 'chat-9' });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      collection: 'assets',
      id: 'a',
      data: { chat: 'chat-9' },
      depth: 0,
      req,
      overrideAccess: true,
    });
  });

  it('does not claim assets when no chat id is known yet', async () => {
    const update = vi.fn();
    const req = request({
      findByID: assets({ id: 'a', filename: 'a.txt', mimeType: 'text/plain', chat: null }),
      update,
    });

    storedFiles({ 'a.txt': 'x' });

    await load(req, [user(reference('a'))]);

    expect(update).not.toHaveBeenCalled();
  });

  it('converts messages without file references without touching storage', async () => {
    const findByID = vi.fn();
    const plain: UIMessage[] = [user({ type: 'text', text: 'hi' })];

    const messages = await load(request({ findByID, chat: { enabled: false } }), plain);

    expect(messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
    expect(findByID).not.toHaveBeenCalled();
  });

  it('rejects file references when chat persistence is disabled', async () => {
    await expect(
      load(request({ chat: { enabled: false } }), [user(reference('a'))]),
    ).rejects.toMatchObject({ status: 400, message: 'Chat attachments require chat persistence' });
  });

  it.each([
    [403, 403, "Access denied for file 'a'"],
    [404, 404, "File 'a' not found"],
  ])('rejects inaccessible records when sending (%i)', async (sourceStatus, status, message) => {
    const findByID = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('no'), { status: sourceStatus }));

    await expect(load(request({ findByID }), [user(reference('a'))])).rejects.toMatchObject({
      status,
      message,
    });
    expect(getFileByPath).not.toHaveBeenCalled();
  });

  it('rejects a record whose stored file is missing when sending', async () => {
    const req = request({ findByID: assets({ id: 'a', filename: 'gone.pdf', ...png }) });

    storedFiles({});

    await expect(load(req, [user(reference('a'))])).rejects.toMatchObject({ status: 404 });
  });

  it.each([403, 404])(
    'replaces an inaccessible record with a marker on other turns (%i)',
    async (sourceStatus) => {
      const findByID = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('no'), { status: sourceStatus }));

      const messages = await load(
        request({ findByID }),
        [user(reference('a', { filename: 'secret.pdf' }), { type: 'text', text: 'Summarize' })],
        { onUnavailable: 'marker' },
      );

      expect(texts(messages)).toEqual([
        "[Can't read secret.pdf: the file couldn't be loaded]",
        'Summarize',
      ]);
      expect(getFileByPath).not.toHaveBeenCalled();
    },
  );

  it('replaces a file that cannot be read with a marker on other turns', async () => {
    const req = request({ findByID: assets({ id: 'a', filename: 'gone.pdf', ...png }) });

    storedFiles({});

    const messages = await load(req, [user(reference('a', { filename: 'report.pdf' }))], {
      onUnavailable: 'marker',
    });

    expect(texts(messages)).toEqual(["[Can't read report.pdf: the file couldn't be loaded]"]);
  });

  it('does not read earlier copies of a file stored with the same hash', async () => {
    const req = request({
      findByID: assets(
        { id: 'old', filename: 'shot-1.png', sha256: 'same', ...png },
        { id: 'new', filename: 'shot-2.png', sha256: 'same', ...png },
      ),
    });

    storedFiles({ 'shot-1.png': 'PNG!', 'shot-2.png': 'PNG!' });

    const messages = await load(req, [
      user(reference('old', { filename: 'shot.png' })),
      user(reference('new', { filename: 'shot.png' })),
    ]);

    expect(contentOf(messages)).toMatchObject([
      { type: 'text', text: '[File repeated later: shot.png]' },
      { type: 'file', filename: 'shot.png' },
    ]);
    expect(getFileByPath).toHaveBeenCalledTimes(1);
    expect(getFileByPath).toHaveBeenCalledWith('/files/shot-2.png');
  });

  it('falls back to the asset ID when an asset has no hash', async () => {
    const req = request({
      findByID: assets(
        { id: 'a', filename: 'a.png', sha256: null, ...png },
        { id: 'b', filename: 'b.png', sha256: null, ...png },
      ),
    });

    storedFiles({ 'a.png': 'PNG!', 'b.png': 'PNG!' });

    const messages = await load(req, [user(reference('a'), reference('b')), user(reference('a'))]);

    expect(contentOf(messages)).toMatchObject([
      { type: 'text', text: '[File repeated later: a.png]' },
      { type: 'file', filename: 'b.png' },
      { type: 'file', filename: 'a.png' },
    ]);
    expect(getFileByPath).toHaveBeenCalledTimes(2);
  });

  it('does not read files the size rule removes', async () => {
    const big = { mimeType: 'application/pdf', filesize: 9 * MiB };
    const req = request({
      findByID: assets(
        { id: 'first', filename: 'first.pdf', ...big },
        { id: 'second', filename: 'second.pdf', ...big },
        { id: 'third', filename: 'third.pdf', ...big },
      ),
    });

    storedFiles({ 'third.pdf': '%PDF' });

    const messages = await load(req, [
      user(reference('first'), reference('second'), reference('third')),
    ]);

    expect(contentOf(messages)).toMatchObject([
      { type: 'text', text: '[File removed: first.pdf]' },
      { type: 'text', text: '[File removed: second.pdf]' },
      { type: 'file', filename: 'third.pdf' },
    ]);
    expect(getFileByPath).toHaveBeenCalledTimes(1);
  });

  it('leaves files the model cannot read out of the size count', async () => {
    const big = { mimeType: 'image/png', filesize: 9 * MiB };
    const req = request({
      findByID: assets(
        { id: 'first', filename: 'first.png', ...big },
        { id: 'second', filename: 'second.png', ...big },
        { id: 'third', filename: 'third.png', ...big },
      ),
    });

    storedFiles({ 'first.png': 'PNG!', 'second.png': 'PNG!', 'third.png': 'PNG!' });

    const messages = await load(
      req,
      [user(reference('first'), reference('second'), reference('third'))],
      { model: 'test/text-only' },
    );

    expect(contentOf(messages).map((part) => (part as { type: string }).type)).toEqual([
      'file',
      'file',
      'file',
    ]);
  });

  it('reads cloud files through the upload handlers without the caller’s cookies', async () => {
    const handler = vi.fn(() => Promise.resolve(new Response('%PDF')));
    const handlerReq = { headers: new Headers(), handler: true };
    const createRequest = vi.fn().mockResolvedValue(handlerReq);
    const doc = { id: 'a', filename: 'cloud.pdf', mimeType: 'application/pdf', prefix: 'chat' };
    const req = request({
      findByID: assets(doc),
      upload: { disableLocalStorage: true, handlers: [handler] },
      createRequest,
    });
    const fetch = vi.fn();

    vi.stubGlobal('fetch', fetch);

    const messages = await load(req, [user(reference('a'))]);

    expect(createRequest).toHaveBeenCalledWith({ user: { id: 'user-1' }, context: {} });
    expect(handler).toHaveBeenCalledWith(handlerReq, {
      doc,
      headers: expect.any(Headers),
      params: { collection: 'assets', filename: 'cloud.pdf', prefix: 'chat' },
    });
    expect(handlerReq.headers.get('cookie')).toBeNull();
    expect(contentOf(messages)).toMatchObject([
      {
        type: 'file',
        mediaType: 'application/pdf',
        data: { url: new URL('data:application/pdf;base64,JVBERg==') },
      },
    ]);
    expect(fetch).not.toHaveBeenCalled();
    expect(getFileByPath).not.toHaveBeenCalled();
  });

  it('follows a signed download redirect from an upload handler', async () => {
    const handler = vi.fn(() =>
      Promise.resolve(Response.redirect('https://bucket.example/cloud.pdf', 302)),
    );
    const fetch = vi.fn().mockResolvedValue(new Response('%PDF'));
    const req = request({
      findByID: assets({ id: 'a', filename: 'cloud.pdf', mimeType: 'application/pdf' }),
      upload: { disableLocalStorage: true, handlers: [handler] },
    });

    vi.stubGlobal('fetch', fetch);

    const messages = await load(req, [user(reference('a'))]);

    expect(fetch).toHaveBeenCalledWith('https://bucket.example/cloud.pdf');
    expect(contentOf(messages)).toMatchObject([{ type: 'file', filename: 'cloud.pdf' }]);
  });

  it('does not call upload handlers for files that become markers', async () => {
    const handler = vi.fn(() => Promise.resolve(new Response('PNG!')));
    const req = request({
      findByID: assets(
        { id: 'old', filename: 'old.png', sha256: 'same', ...png },
        { id: 'new', filename: 'new.png', sha256: 'same', ...png },
      ),
      upload: { disableLocalStorage: true, handlers: [handler] },
    });

    await load(req, [user(reference('old'), reference('new'))]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        params: expect.objectContaining({ filename: 'new.png' }),
      }),
    );
  });

  it('replaces a cloud file the handler cannot find with a marker on other turns', async () => {
    const handler = vi.fn(() => Promise.resolve(new Response(null, { status: 404 })));
    const req = request({
      findByID: assets({ id: 'a', filename: 'gone.png', ...png }),
      upload: { disableLocalStorage: true, handlers: [handler] },
    });

    const messages = await load(req, [user(reference('a'))], { onUnavailable: 'marker' });

    expect(texts(messages)).toEqual(["[Can't read gone.png: the file couldn't be loaded]"]);
  });

  it('sends the stored text of a Word document without reading the file', async () => {
    const update = vi.fn();
    const req = request({
      findByID: assets({ id: 'report', filename: 'report-1.docx', text: reportText, ...docx }),
      update,
    });

    storedFiles({});

    const messages = await load(req, [user(reference('report', { filename: 'report.docx' }))]);

    expect(texts(messages)).toEqual([`Attached file "report.docx":\n${reportText}`]);
    expect(getFileByPath).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('sends stored empty text as an empty attachment', async () => {
    const req = request({
      findByID: assets({ id: 'blank', filename: 'blank.docx', text: '', ...docx }),
    });

    storedFiles({});

    const messages = await load(req, [user(reference('blank'))]);

    expect(texts(messages)).toEqual(['Attached file "blank.docx":\n']);
  });

  it('reads a Word document without stored text once and stores its text', async () => {
    const update = vi.fn().mockResolvedValue({});
    const req = request({
      findByID: assets({ id: 'report', filename: 'report.docx', text: null, ...docx }),
      update,
    });

    storedFiles({ 'report.docx': Buffer.from(reportDocx()) });

    const messages = await load(req, [user(reference('report'))]);

    expect(texts(messages)).toEqual([`Attached file "report.docx":\n${reportText}`]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      collection: 'assets',
      id: 'report',
      data: { text: reportText },
      depth: 0,
      req,
      overrideAccess: true,
    });
  });

  it('recognizes an Excel workbook by its stored name when its type is generic', async () => {
    const update = vi.fn().mockResolvedValue({});
    const req = request({
      findByID: assets({
        id: 'budget',
        filename: 'budget.xlsx',
        mimeType: 'application/octet-stream',
      }),
      update,
    });

    storedFiles({ 'budget.xlsx': Buffer.from(budgetXlsx()) });

    const messages = await load(req, [user(reference('budget'))]);

    expect(texts(messages)).toEqual([`Attached file "budget.xlsx":\n${budgetText}`]);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'budget', data: { text: budgetText } }),
    );
  });

  it('replaces an unreadable Word document with a marker and stores nothing', async () => {
    const update = vi.fn();
    const req = request({
      findByID: assets({ id: 'locked', filename: 'locked.docx', ...docx }),
      update,
    });

    storedFiles({ 'locked.docx': Buffer.from(encryptedOfficeFile()) });

    const messages = await load(req, [user(reference('locked'))]);

    expect(texts(messages)).toEqual(["[Can't read locked.docx: the file couldn't be read]"]);
    expect(update).not.toHaveBeenCalled();
  });

  it('reads a repeated Word document once, as its newest copy', async () => {
    const update = vi.fn().mockResolvedValue({});
    const req = request({
      findByID: assets(
        { id: 'old', filename: 'report-1.docx', sha256: 'same', ...docx },
        { id: 'new', filename: 'report-2.docx', sha256: 'same', ...docx },
      ),
      update,
    });

    storedFiles({
      'report-1.docx': Buffer.from(reportDocx()),
      'report-2.docx': Buffer.from(reportDocx()),
    });

    const messages = await load(req, [
      user(reference('old', { filename: 'report.docx' })),
      user(reference('new', { filename: 'report.docx' })),
    ]);

    expect(texts(messages)).toEqual([
      '[File repeated later: report.docx]',
      `Attached file "report.docx":\n${reportText}`,
    ]);
    expect(getFileByPath).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }));
  });

  it('stores the text of several files one at a time', async () => {
    let writing = 0;
    let overlapped = false;

    const update = vi.fn(async () => {
      writing += 1;
      overlapped ||= writing > 1;

      await new Promise((resolve) => setImmediate(resolve));

      writing -= 1;

      return {};
    });

    const req = request({
      findByID: assets(
        { id: 'report', filename: 'report.docx', ...docx },
        { id: 'budget', filename: 'budget.xlsx', mimeType: XLSX_TYPE },
      ),
      update,
    });

    storedFiles({
      'report.docx': Buffer.from(reportDocx()),
      'budget.xlsx': Buffer.from(budgetXlsx()),
    });

    await load(req, [user(reference('report'), reference('budget'))]);

    expect(update).toHaveBeenCalledTimes(2);
    expect(overlapped).toBe(false);
  });

  it('sends the text and stores the next file when storing one file’s text fails', async () => {
    const conflict = new Error('WriteConflict');
    const update = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValue({});
    const logger = { warn: vi.fn() };

    const req = request({
      findByID: assets(
        { id: 'report', filename: 'report.docx', ...docx },
        { id: 'budget', filename: 'budget.xlsx', mimeType: XLSX_TYPE },
      ),
      update,
      logger,
    });

    storedFiles({
      'report.docx': Buffer.from(reportDocx()),
      'budget.xlsx': Buffer.from(budgetXlsx()),
    });

    const messages = await load(req, [user(reference('report'), reference('budget'))]);

    expect(texts(messages)).toEqual([
      `Attached file "report.docx":\n${reportText}`,
      `Attached file "budget.xlsx":\n${budgetText}`,
    ]);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'budget', data: { text: budgetText } }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      { err: conflict, id: 'report' },
      '[frogbot] Failed to store the text of a file',
    );
  });

  it('fails when storing the text fails inside the caller’s transaction', async () => {
    const conflict = new Error('WriteConflict');

    const req = request({
      findByID: assets({ id: 'report', filename: 'report.docx', ...docx }),
      update: vi.fn().mockRejectedValue(conflict),
      transactionID: 'transaction-1',
    });

    storedFiles({ 'report.docx': Buffer.from(reportDocx()) });

    await expect(load(req, [user(reference('report'))])).rejects.toBe(conflict);
  });

  it('does not read local files outside the configured static directory', async () => {
    const req = request({
      findByID: assets({ id: 'a', filename: '../secret.txt', mimeType: 'text/plain' }),
    });

    await expect(load(req, [user(reference('a'))])).rejects.toMatchObject({ status: 404 });
    expect(getFileByPath).not.toHaveBeenCalled();
  });
});
