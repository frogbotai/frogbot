import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { FrogBotInstance } from 'frogbot';
import { databaseMemory } from 'frogbot/memory';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StubChatModel, StubChatRequest } from '../__helpers/shared/StubChatModel.js';
import { startStubChatModel } from '../__helpers/shared/StubChatModel.js';
import { createMemoryHarness } from '../memory/runtime.js';
import { chatModel, chatPort } from '../memory/shared.js';

function systemText(request: StubChatRequest | undefined): string {
  const system = request?.messages.find(({ role }) => role === 'system');

  return typeof system?.content === 'string' ? system.content : JSON.stringify(system?.content);
}

const readers = ({ req }: { req: { user?: { email?: string } | null } }) =>
  req.user?.email ? { readers: { contains: req.user.email } } : false;

const owner = ({ req }: { req: { user?: { email?: string } | null } }) =>
  req.user?.email ? { ownerEmail: { equals: req.user.email } } : false;

describe('a shared Space collection of your own', () => {
  const harness = createMemoryHarness({
    agents: [{ slug: 'helper', model: chatModel, instructions: 'Help.', memory: true }] as never,
    collections: [
      {
        slug: 'projects',
        space: true,
        admin: { useAsTitle: 'name' },
        access: {
          create: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
          read: readers,
          update: owner,
          delete: owner,
        },
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'ownerEmail', type: 'text' },
          { name: 'readers', type: 'text' },
        ],
      },
    ] as never,
    memory: () => databaseMemory(),
  });

  let frogbot: FrogBotInstance;
  let model: StubChatModel;

  beforeAll(async () => {
    model = await startStubChatModel(chatPort);
    frogbot = await harness.boot();
  });

  afterAll(async () => {
    await model?.close();
    await harness.close();
    await rm(resolve('frogbot-space-files'), { recursive: true, force: true });
  });

  it('stops giving a Space to a reader who lost access, in chats they started', async () => {
    const annEmail = 'ann@frogbot.local';
    const benEmail = 'ben@frogbot.local';
    const ann = await harness.createUser(annEmail);
    const ben = await harness.createUser(benEmail);

    const project = await frogbot.create({
      collection: 'projects',
      data: {
        name: 'Acme',
        ownerEmail: annEmail,
        readers: `${annEmail} ${benEmail}`,
        instructions: 'Acme instructions.',
      },
      user: ann,
      overrideAccess: false,
    });

    const file = Buffer.from('Acme file.');

    await frogbot.create({
      collection: 'frogbot-space-files',
      data: { space: project.id },
      file: { data: file, mimetype: 'text/markdown', name: 'acme.md', size: file.byteLength },
      user: ann,
      overrideAccess: false,
    });

    await frogbot.memory.save({
      scope: 'space',
      space: project.id,
      text: 'Acme memory.',
      pinned: true,
    });

    const chat = await frogbot.create({
      collection: 'chats',
      data: { agent: 'helper', space: project.id },
      user: ben,
      overrideAccess: false,
    });

    async function send() {
      const turn = (await frogbot.agents.helper.streamMessage({
        req: await frogbot.createRequest({ user: ben }),
        chatId: chat.id,
        prompt: 'Hello.',
        clientTools: { kinds: [], approval: true },
      })) as { persistence: Promise<void> };

      await turn.persistence;
    }

    model.respond({ text: 'One.' }, { text: 'Two.' });
    await send();

    expect(systemText(model.requests[0])).toContain(
      '## Space: Acme\n\nThis chat belongs to this Space.\n\nAcme instructions.',
    );
    expect(systemText(model.requests[0])).toContain('- Acme memory.');

    await frogbot.update({
      collection: 'projects',
      id: project.id,
      data: { readers: annEmail },
      user: ann,
      overrideAccess: false,
    });

    await send();

    const after = model.requests[1];

    expect(systemText(after)).not.toContain('Acme');
    expect((after?.tools ?? []).map(({ function: { name } }) => name)).not.toContain(
      'space_file_read',
    );
  });

  it('does not let a read-only member move files out of a shared Space', async () => {
    const annEmail = 'ann-files@frogbot.local';
    const benEmail = 'ben-files@frogbot.local';
    const ann = await harness.createUser(annEmail);
    const ben = await harness.createUser(benEmail);

    const project = await frogbot.create({
      collection: 'projects',
      data: { name: 'Shared', ownerEmail: annEmail, readers: `${annEmail} ${benEmail}` },
      user: ann,
      overrideAccess: false,
    });

    const benProject = await frogbot.create({
      collection: 'projects',
      data: { name: 'Ben only', ownerEmail: benEmail, readers: benEmail },
      user: ben,
      overrideAccess: false,
    });

    const data = Buffer.from('Shared file.');
    const file = await frogbot.create({
      collection: 'frogbot-space-files',
      data: { space: project.id },
      file: { data, mimetype: 'text/markdown', name: 'shared.md', size: data.byteLength },
      user: ann,
      overrideAccess: false,
    });

    await frogbot
      .update({
        collection: 'frogbot-space-files',
        where: { space: { equals: project.id } },
        data: { space: benProject.id },
        user: ben,
        overrideAccess: false,
      })
      .catch(() => undefined);

    const stored = await frogbot.findByID({
      collection: 'frogbot-space-files',
      id: file.id,
      depth: 0,
      overrideAccess: true,
    });

    expect(stored.space).toEqual(project.id);
  });
});
