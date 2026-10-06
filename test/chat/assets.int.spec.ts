import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { UIMessage } from 'ai';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { resolveChatContext } from 'frogbot/test';
import { saveChatAsset } from 'frogbot/tools';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CHAT_ASSETS_SLUG } from '../../packages/frogbot/src/chat/collections/assets.js';
import type { ToolCtx } from '../../packages/frogbot/src/tools/types.js';
import type { AgentModelMessagesProps } from '../../packages/frogbot/src/uploads/toAgentModelMessages.js';
import { toAgentModelMessages } from '../../packages/frogbot/src/uploads/toAgentModelMessages.js';
import { createFrogBotSDK, FrogBotSDKError } from '../../packages/sdk/src/index.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import {
  budgetText,
  budgetXlsx,
  encryptedOfficeFile,
  farCellXlsx,
  manyEntries,
  oleFile,
  reportDocx,
  reportText,
  sharedDataEntries,
  xlsxFile,
  zipBomb,
} from '../__helpers/shared/office.js';
import type { Config } from './frogbot-types.js';
import { agentSlug, chatsSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type User = { id: number | string };

type Asset = {
  id: number | string;
  filename: string;
  mimeType: string;
  owner: number | string | null;
  chat: number | string | null;
  sha256?: string | null;
  text?: string | null;
};

type Refusal = {
  errors: { name: string; message: string; data: unknown }[];
};

const password = 'frogbot-int-password';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

describe('chat assets', () => {
  let booted: BootedFrogBot;
  let owner: User;
  let stranger: User;
  let ownerToken: string;
  let strangerToken: string;
  let sequence = 0;

  async function createUser(email: string): Promise<{ user: User; token: string }> {
    const user = (await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password },
      overrideAccess: true,
    })) as User;

    const response = await booted.frogbot.handleRequest(
      new Request(`http://localhost/api/${usersSlug}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );

    const { token } = (await response.json()) as { token: string };

    return { user, token };
  }

  async function uploadFile({
    token,
    file,
    filename,
    data = {},
  }: {
    token: string | undefined;
    file: Blob;
    filename: string;
    data?: Record<string, unknown>;
  }): Promise<Response> {
    const body = new FormData();
    body.set('_payload', JSON.stringify(data));
    body.set('file', file, filename);

    return booted.frogbot.handleRequest(
      new Request(`http://localhost/api/${CHAT_ASSETS_SLUG}`, {
        method: 'POST',
        headers: token ? { authorization: `JWT ${token}` } : {},
        body,
      }),
    );
  }

  async function upload(
    token: string | undefined,
    content = 'hello',
    data: Record<string, unknown> = {},
  ): Promise<Response> {
    sequence += 1;

    return uploadFile({
      token,
      file: new Blob([content], { type: 'text/plain' }),
      filename: `note-${sequence}.txt`,
      data,
    });
  }

  function officeBlob({ bytes, filename }: { bytes: Uint8Array; filename: string }): Blob {
    return new Blob([bytes], { type: filename.endsWith('.xlsx') ? XLSX_TYPE : DOCX_TYPE });
  }

  async function uploadOffice({
    bytes,
    filename,
    data,
  }: {
    bytes: Uint8Array;
    filename: string;
    data?: Record<string, unknown>;
  }): Promise<Response> {
    return uploadFile({ token: ownerToken, file: officeBlob({ bytes, filename }), filename, data });
  }

  async function uploadOfficeAsset(props: Parameters<typeof uploadOffice>[0]): Promise<Asset> {
    const response = await uploadOffice(props);

    expect(response.status).toBe(201);

    const { doc } = (await response.json()) as { doc: Asset };

    return doc;
  }

  async function countAssets(): Promise<number> {
    const { totalDocs } = await booted.frogbot.find({
      collection: CHAT_ASSETS_SLUG,
      limit: 0,
      overrideAccess: true,
    });

    return totalDocs;
  }

  async function uploadAsset(token: string): Promise<Asset> {
    const response = await upload(token);

    expect(response.status).toBe(201);

    const { doc } = (await response.json()) as { doc: Asset };

    return doc;
  }

  async function get(pathname: string, token?: string): Promise<Response> {
    return booted.frogbot.handleRequest(
      new Request(`http://localhost${pathname}`, {
        headers: token ? { authorization: `JWT ${token}` } : {},
      }),
    );
  }

  async function requestFor(user: User) {
    return booted.frogbot.createRequest({ user: { ...user, collection: usersSlug } } as never);
  }

  async function createChat(user: User): Promise<number | string> {
    const req = await requestFor(user);

    const result = await resolveChatContext({
      req,
      agentSlug,
      incoming: [{ id: `chat-${++sequence}`, role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
      tools: {},
    });

    return result.chatId!;
  }

  async function readAsset(id: number | string): Promise<Asset> {
    return (await booted.frogbot.findByID({
      collection: CHAT_ASSETS_SLUG,
      id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })) as Asset;
  }

  function loadMessages(props: Pick<AgentModelMessagesProps, 'req' | 'messages' | 'chatId'>) {
    return toAgentModelMessages({
      ...props,
      model: 'test/gpt-4.1-mini',
      tools: {},
      onUnavailable: 'throw',
    });
  }

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'chat-assets');
  });

  afterAll(async () => {
    await booted.shutdown();
    await fs.rm(path.resolve(CHAT_ASSETS_SLUG), { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    const created = await Promise.all([
      createUser('owner@frogbot.local'),
      createUser('stranger@frogbot.local'),
    ]);

    owner = created[0].user;
    ownerToken = created[0].token;
    stranger = created[1].user;
    strangerToken = created[1].token;
  });

  it('exposes the assets slug in the manifest and hides the collection from the admin', async () => {
    const response = await get('/api/frogbot', ownerToken);
    const manifest = (await response.json()) as { chat: { assetsSlug?: string } };

    expect(manifest.chat.assetsSlug).toBe(CHAT_ASSETS_SLUG);

    const payloadConfig = await booted.frogbot.config._internal.payloadConfig;
    const assets = payloadConfig.collections.find(({ slug }) => slug === CHAT_ASSETS_SLUG);

    expect(assets?.admin.hidden).toBe(true);
    expect(assets?.upload).toBeTruthy();
  });

  it('records the uploader as owner and leaves the chat unset', async () => {
    const doc = await uploadAsset(ownerToken);
    const stored = await readAsset(doc.id);

    expect(stored.owner).toBe(owner.id);
    expect(stored.chat ?? null).toBeNull();
    expect(stored.mimeType).toBe('text/plain');
  });

  it('rejects anonymous uploads', async () => {
    const response = await upload(undefined);

    expect(response.status).toBe(403);
  });

  it('stores the SHA-256 of the uploaded contents', async () => {
    const doc = await uploadAsset(ownerToken);

    expect((await readAsset(doc.id)).sha256).toBe(sha256('hello'));
  });

  it('stores the real hash when the upload sends its own', async () => {
    const response = await upload(ownerToken, 'real contents', { sha256: sha256('forged') });
    const { doc } = (await response.json()) as { doc: Asset };

    expect(response.status).toBe(201);
    expect((await readAsset(doc.id)).sha256).toBe(sha256('real contents'));
  });

  it('keeps the hash out of REST responses', async () => {
    const response = await upload(ownerToken);
    const { doc: created } = (await response.json()) as { doc: Asset };

    const record = await get(`/api/${CHAT_ASSETS_SLUG}/${created.id}`, ownerToken);
    const doc = (await record.json()) as Asset;

    expect(created).not.toHaveProperty('sha256');
    expect(doc.id).toBe(created.id);
    expect(doc).not.toHaveProperty('sha256');
  });

  it('hashes agent-generated files', async () => {
    const chatId = await createChat(owner);
    const req = await requestFor(owner);
    const ctx: ToolCtx = {
      req,
      frogbot: booted.frogbot as never,
      agent: { slug: agentSlug, runId: 'run-hash', chatId },
    };

    const asset = await saveChatAsset({
      ctx,
      filename: 'report.txt',
      mimeType: 'text/plain',
      data: Buffer.from('generated'),
    });

    expect((await readAsset(asset.id)).sha256).toBe(sha256('generated'));
  });

  it('lets the owner read and download an unlinked asset', async () => {
    const doc = await uploadAsset(ownerToken);

    const record = await get(`/api/${CHAT_ASSETS_SLUG}/${doc.id}`, ownerToken);
    const file = await get(`/api/${CHAT_ASSETS_SLUG}/file/${doc.filename}`, ownerToken);

    expect(record.status).toBe(200);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe('hello');
  });

  it('hides an unlinked asset from other users and anonymous callers', async () => {
    const doc = await uploadAsset(ownerToken);

    const strangerRecord = await get(`/api/${CHAT_ASSETS_SLUG}/${doc.id}`, strangerToken);
    const strangerFile = await get(`/api/${CHAT_ASSETS_SLUG}/file/${doc.filename}`, strangerToken);
    const anonymousFile = await get(`/api/${CHAT_ASSETS_SLUG}/file/${doc.filename}`);

    expect(strangerRecord.status).toBe(404);
    expect(strangerFile.status).toBe(403);
    expect(anonymousFile.status).toBe(403);
  });

  it('refuses updates and deletes through the API', async () => {
    const doc = await uploadAsset(ownerToken);

    const patch = await booted.frogbot.handleRequest(
      new Request(`http://localhost/api/${CHAT_ASSETS_SLUG}/${doc.id}`, {
        method: 'PATCH',
        headers: { authorization: `JWT ${ownerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ chat: null }),
      }),
    );
    const remove = await booted.frogbot.handleRequest(
      new Request(`http://localhost/api/${CHAT_ASSETS_SLUG}/${doc.id}`, {
        method: 'DELETE',
        headers: { authorization: `JWT ${ownerToken}` },
      }),
    );

    expect(patch.status).toBe(403);
    expect(remove.status).toBe(403);
  });

  it('links referenced assets to the chat on the first message and inlines their text', async () => {
    const doc = await uploadAsset(ownerToken);
    const chatId = await createChat(owner);
    const req = await requestFor(owner);
    const messages: UIMessage[] = [
      {
        id: 'm1',
        role: 'user',
        parts: [
          { type: 'text', text: 'Read this' },
          { type: 'file-reference', id: doc.id } as never,
        ],
      },
    ];

    const resolved = await loadMessages({ req, messages, chatId });

    expect(resolved[0]?.content).toEqual([
      { type: 'text', text: 'Read this' },
      { type: 'text', text: `Attached file "${doc.filename}":\nhello` },
    ]);
    expect((await readAsset(doc.id)).chat).toBe(chatId);
  });

  it('keeps the hash when an asset is linked to a chat', async () => {
    const doc = await uploadAsset(ownerToken);
    const chatId = await createChat(owner);

    await booted.frogbot.update({
      collection: CHAT_ASSETS_SLUG,
      id: doc.id,
      data: { chat: chatId },
      overrideAccess: true,
    });

    const stored = await readAsset(doc.id);

    expect(stored.chat).toBe(chatId);
    expect(stored.sha256).toBe(sha256('hello'));
  });

  it('refuses to attach another user’s asset', async () => {
    const doc = await uploadAsset(ownerToken);
    const chatId = await createChat(stranger);
    const req = await requestFor(stranger);
    const messages: UIMessage[] = [
      { id: 'm1', role: 'user', parts: [{ type: 'file-reference', id: doc.id } as never] },
    ];

    await expect(loadMessages({ req, messages, chatId })).rejects.toMatchObject({
      status: 404,
    });
    expect((await readAsset(doc.id)).chat ?? null).toBeNull();
  });

  it('grants access to whoever can read the linked chat', async () => {
    const doc = await uploadAsset(ownerToken);
    const chatId = await createChat(owner);
    const req = await requestFor(owner);

    await loadMessages({
      req,
      chatId,
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'file-reference', id: doc.id } as never] },
      ],
    });

    const before = await get(`/api/${CHAT_ASSETS_SLUG}/file/${doc.filename}`, strangerToken);

    expect(before.status).toBe(403);

    await booted.frogbot.update({
      collection: chatsSlug,
      id: chatId,
      data: { sharedWith: [stranger.id] },
      overrideAccess: true,
    });

    const record = await get(`/api/${CHAT_ASSETS_SLUG}/${doc.id}`, strangerToken);
    const file = await get(`/api/${CHAT_ASSETS_SLUG}/file/${doc.filename}`, strangerToken);

    expect(record.status).toBe(200);
    expect(file.status).toBe(200);
  });

  it('saves agent-generated files against the current chat', async () => {
    const chatId = await createChat(owner);
    const req = await requestFor(owner);
    const ctx: ToolCtx = {
      req,
      frogbot: booted.frogbot as never,
      agent: { slug: agentSlug, runId: 'run-1', chatId },
    };

    const asset = await saveChatAsset({
      ctx,
      filename: 'screenshot.png',
      mimeType: 'image/png',
      data: await fs.readFile(path.resolve(dirname, '../uploads/image.png')),
    });

    const stored = await readAsset(asset.id);
    const file = await get(`/api/${CHAT_ASSETS_SLUG}/file/${asset.filename}`, ownerToken);

    expect(stored.chat).toBe(chatId);
    expect(stored.owner).toBe(owner.id);
    expect(stored.mimeType).toBe('image/png');
    expect(file.status).toBe(200);
  });

  it('rejects saving an asset without a current chat', async () => {
    const req = await requestFor(owner);
    const ctx: ToolCtx = {
      req,
      frogbot: booted.frogbot as never,
      agent: { slug: agentSlug, runId: 'run-2' },
    };

    await expect(
      saveChatAsset({ ctx, filename: 'x.txt', mimeType: 'text/plain', data: Buffer.from('x') }),
    ).rejects.toThrow('[frogbot] saveChatAsset requires chat persistence and a current chat.');
  });

  it('reads an uploaded Word document and keeps the original file', async () => {
    const bytes = reportDocx();

    const response = await uploadOffice({ bytes, filename: 'report.docx' });
    const { doc } = (await response.json()) as { doc: Asset };

    const stored = await fs.readFile(path.resolve(CHAT_ASSETS_SLUG, doc.filename));

    expect(response.status).toBe(201);
    expect(doc).toMatchObject({ filename: 'report.docx', mimeType: DOCX_TYPE, text: reportText });
    expect(new Uint8Array(stored)).toEqual(bytes);
    expect((await readAsset(doc.id)).sha256).toBe(sha256(bytes));
  });

  it('reads an uploaded Excel workbook and keeps the original file', async () => {
    const bytes = budgetXlsx();

    const response = await uploadOffice({ bytes, filename: 'budget.xlsx' });
    const { doc } = (await response.json()) as { doc: Asset };

    const stored = await fs.readFile(path.resolve(CHAT_ASSETS_SLUG, doc.filename));

    expect(response.status).toBe(201);
    expect(doc).toMatchObject({ filename: 'budget.xlsx', mimeType: XLSX_TYPE, text: budgetText });
    expect(new Uint8Array(stored)).toEqual(bytes);
    expect((await readAsset(doc.id)).sha256).toBe(sha256(bytes));
  });

  it('reads a Word document created through the Local API', async () => {
    const data = Buffer.from(reportDocx());

    const created = (await booted.frogbot.create({
      collection: CHAT_ASSETS_SLUG,
      data: {},
      file: { data, mimetype: DOCX_TYPE, name: 'local.docx', size: data.byteLength },
      overrideAccess: true,
    })) as Asset;

    expect(created.text).toBe(reportText);
    expect((await readAsset(created.id)).text).toBe(reportText);
  });

  it('throws the refusal from a Local API create and stores nothing', async () => {
    const data = Buffer.from(encryptedOfficeFile());
    const before = await countAssets();

    const created = booted.frogbot.create({
      collection: CHAT_ASSETS_SLUG,
      data: {},
      file: { data, mimetype: DOCX_TYPE, name: 'local-locked.docx', size: data.byteLength },
      overrideAccess: true,
    });

    await expect(created).rejects.toMatchObject({
      name: 'ValidationError',
      data: {
        errors: [
          {
            path: 'file',
            message: "local-locked.docx couldn't be read: it is password-protected.",
          },
        ],
      },
    });
    expect(await countAssets()).toBe(before);
  });

  it('stores no text for a plain text upload', async () => {
    const doc = await uploadAsset(ownerToken);

    expect(doc.text).toBeNull();
    expect((await readAsset(doc.id)).text).toBeNull();
  });

  it('ignores text sent with an upload', async () => {
    const office = await uploadOfficeAsset({
      bytes: reportDocx(),
      filename: 'forged.docx',
      data: { text: 'forged' },
    });

    const plain = await upload(ownerToken, 'hello', { text: 'forged' });
    const { doc } = (await plain.json()) as { doc: Asset };

    expect((await readAsset(office.id)).text).toBe(reportText);
    expect((await readAsset(doc.id)).text).toBeNull();
  });

  it('keeps the text when an asset is linked to a chat', async () => {
    const doc = await uploadOfficeAsset({ bytes: reportDocx(), filename: 'linked.docx' });
    const chatId = await createChat(owner);

    await booted.frogbot.update({
      collection: CHAT_ASSETS_SLUG,
      id: doc.id,
      data: { chat: chatId },
      overrideAccess: true,
    });

    const stored = await readAsset(doc.id);

    expect(stored.chat).toBe(chatId);
    expect(stored.text).toBe(reportText);
  });

  it('leaves the text out of REST and SDK reads that exclude it', async () => {
    const doc = await uploadOfficeAsset({ bytes: reportDocx(), filename: 'selected.docx' });

    const response = await get(`/api/${CHAT_ASSETS_SLUG}/${doc.id}?select[text]=false`, ownerToken);
    const record = (await response.json()) as Asset;

    const sdk = createFrogBotSDK<Config>({ baseURL: `${booted.baseUrl}/api` });

    const selected = await sdk.findByID(
      { collection: CHAT_ASSETS_SLUG, id: doc.id, select: { text: false } },
      { headers: { authorization: `JWT ${ownerToken}` } },
    );

    expect(record).toMatchObject({ id: doc.id, filename: 'selected.docx' });
    expect(record).not.toHaveProperty('text');
    expect(selected).toMatchObject({ id: doc.id, filename: 'selected.docx' });
    expect(selected).not.toHaveProperty('text');
  });

  it('shows the text only to readers of the asset', async () => {
    const doc = await uploadOfficeAsset({ bytes: reportDocx(), filename: 'shared.docx' });
    const chatId = await createChat(owner);

    await booted.frogbot.update({
      collection: CHAT_ASSETS_SLUG,
      id: doc.id,
      data: { chat: chatId },
      overrideAccess: true,
    });

    const before = await get(`/api/${CHAT_ASSETS_SLUG}/${doc.id}`, strangerToken);

    await booted.frogbot.update({
      collection: chatsSlug,
      id: chatId,
      data: { sharedWith: [stranger.id] },
      overrideAccess: true,
    });

    const after = await get(`/api/${CHAT_ASSETS_SLUG}/${doc.id}`, strangerToken);

    expect(before.status).toBe(404);
    expect(after.status).toBe(200);
    expect(((await after.json()) as Asset).text).toBe(reportText);
  });

  it.each([
    {
      problem: 'a corrupt file',
      filename: 'broken.docx',
      bytes: () => reportDocx().subarray(0, -10),
      cause: "it isn't a valid Word or Excel file",
    },
    {
      problem: 'a password-protected file',
      filename: 'locked.xlsx',
      bytes: encryptedOfficeFile,
      cause: 'it is password-protected',
    },
    {
      problem: 'a renamed Excel 97-2003 workbook',
      filename: 'legacy.xlsx',
      bytes: () => oleFile({ streams: ['Workbook'] }),
      cause: "it isn't a valid Word or Excel file",
    },
    {
      problem: 'a renamed PDF',
      filename: 'scan.docx',
      bytes: () => pdf,
      cause: "it isn't a valid Word or Excel file",
    },
    {
      problem: 'a zip bomb',
      filename: 'bomb.docx',
      bytes: () => zipBomb({ declaredBytes: 1_000 }),
      cause: 'it is too large when expanded',
    },
  ])(
    'refuses $problem with a validation error and stores nothing',
    async ({ filename, bytes, cause }) => {
      const before = await countAssets();

      const response = await uploadOffice({ bytes: bytes(), filename });
      const body = (await response.json()) as Refusal;

      expect(response.status).toBe(400);
      expect(body).toEqual({
        errors: [
          {
            name: 'ValidationError',
            message: 'The following field is invalid: file',
            data: {
              collection: CHAT_ASSETS_SLUG,
              errors: [{ path: 'file', message: `${filename} couldn't be read: ${cause}.` }],
            },
          },
        ],
      });
      expect(await countAssets()).toBe(before);
      await expect(fs.access(path.resolve(CHAT_ASSETS_SLUG, filename))).rejects.toThrow();
    },
  );

  it('refuses an anonymous Office upload before reading it', async () => {
    const filename = 'anonymous.docx';

    const response = await uploadFile({
      token: undefined,
      file: officeBlob({ bytes: encryptedOfficeFile(), filename }),
      filename,
    });

    expect(response.status).toBe(403);
  });

  it('saves an unreadable agent-generated workbook without reading it', async () => {
    const chatId = await createChat(owner);
    const req = await requestFor(owner);
    const ctx: ToolCtx = {
      req,
      frogbot: booted.frogbot as never,
      agent: { slug: agentSlug, runId: 'run-office', chatId },
    };

    const asset = await saveChatAsset({
      ctx,
      filename: 'download.xlsx',
      mimeType: XLSX_TYPE,
      data: encryptedOfficeFile(),
    });

    const stored = await readAsset(asset.id);

    expect(stored.text).toBeNull();
    expect(stored.sha256).toBe(sha256(encryptedOfficeFile()));
  });

  it('reads later uploads on the same request after saving an agent-generated file', async () => {
    const chatId = await createChat(owner);
    const req = await requestFor(owner);
    const ctx: ToolCtx = {
      req,
      frogbot: booted.frogbot as never,
      agent: { slug: agentSlug, runId: 'run-office-then-upload', chatId },
    };

    await saveChatAsset({
      ctx,
      filename: 'generated.docx',
      mimeType: DOCX_TYPE,
      data: reportDocx(),
    });

    const data = Buffer.from(reportDocx());

    const created = (await booted.frogbot.create({
      collection: CHAT_ASSETS_SLUG,
      data: {},
      file: { data, mimetype: DOCX_TYPE, name: 'after.docx', size: data.byteLength },
      req,
      overrideAccess: true,
    })) as Asset;

    expect(created.text).toBe(reportText);
  });

  it('returns the text from an SDK upload and throws the refusal as a FrogBotSDKError', async () => {
    const sdk = createFrogBotSDK<Config>({
      baseURL: `${booted.baseUrl}/api`,
      headers: { authorization: `JWT ${ownerToken}` },
    });

    const uploaded = await sdk.upload(
      CHAT_ASSETS_SLUG,
      new File([reportDocx()], 'sdk.docx', { type: DOCX_TYPE }),
    );

    const refused = await sdk
      .upload(CHAT_ASSETS_SLUG, new File([encryptedOfficeFile()], 'sdk.xlsx', { type: XLSX_TYPE }))
      .catch((error: unknown) => error);

    expect(uploaded).toMatchObject({ filename: 'sdk.docx', mimeType: DOCX_TYPE, text: reportText });
    expect(refused).toBeInstanceOf(FrogBotSDKError);
    expect(refused).toMatchObject({
      status: 400,
      errors: [
        {
          name: 'ValidationError',
          data: {
            errors: [
              { path: 'file', message: "sdk.xlsx couldn't be read: it is password-protected." },
            ],
          },
        },
      ],
    });
  });

  it('refuses a client update to the text', async () => {
    const doc = await uploadOfficeAsset({ bytes: reportDocx(), filename: 'locked-text.docx' });

    const response = await booted.frogbot.handleRequest(
      new Request(`http://localhost/api/${CHAT_ASSETS_SLUG}/${doc.id}`, {
        method: 'PATCH',
        headers: { authorization: `JWT ${ownerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'forged' }),
      }),
    );

    expect(response.status).toBe(403);
    expect((await readAsset(doc.id)).text).toBe(reportText);
  });

  it.each([
    {
      problem: 'a zip with 10,001 entries',
      filename: 'entries.docx',
      bytes: () => manyEntries(10_001),
      cause: 'it is too large when expanded',
    },
    {
      problem: 'a workbook named .docx',
      filename: 'budget.docx',
      bytes: budgetXlsx,
      cause: "it isn't a valid Word or Excel file",
    },
    {
      problem: 'a text file named .xlsx',
      filename: 'notes.xlsx',
      bytes: () => strToU8('Region,Total\nNorth,1200\n'),
      cause: "it isn't a valid Word or Excel file",
    },
    {
      problem: 'a zip bomb under an image name',
      filename: 'image-bomb.docx',
      bytes: () => zipBomb({ path: 'word/media/image1.png', declaredBytes: 1_000 }),
      cause: 'it is too large when expanded',
    },
    {
      problem: 'a workbook whose entries share stored data',
      filename: 'shared.xlsx',
      bytes: () =>
        sharedDataEntries({
          zip: zipSync({
            ...unzipSync(budgetXlsx()),
            'xl/padding.xml': [new Uint8Array(1_000_000).fill(0x20), { level: 0 }],
          }),
          name: 'xl/padding.xml',
          copies: 200,
        }),
      cause: 'it is too large when expanded',
    },
    {
      problem: 'a workbook whose only cell is the last cell of the grid',
      filename: 'far-cell.xlsx',
      bytes: farCellXlsx,
      cause: 'it is too large when expanded',
    },
  ])('refuses $problem at upload', async ({ filename, bytes, cause }) => {
    const before = await countAssets();

    const response = await uploadOffice({ bytes: bytes(), filename });
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.data).toEqual({
      collection: CHAT_ASSETS_SLUG,
      errors: [{ path: 'file', message: `${filename} couldn't be read: ${cause}.` }],
    });
    expect(await countAssets()).toBe(before);
  });

  it('never fails an upload with a server error for an out-of-range date cell', async () => {
    const workbook = xlsxFile({
      sheets: [
        {
          name: 'Q1',
          xml: '<sheetData><row r="1"><c r="A1" s="1"><v>1e300</v></c></row></sheetData>',
        },
      ],
      styles:
        '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs>',
    });

    const response = await uploadOffice({ bytes: workbook, filename: 'dates.xlsx' });

    expect([201, 400]).toContain(response.status);
  });
});
