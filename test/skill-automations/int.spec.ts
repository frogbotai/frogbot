import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { allow, rolesPlugin } from '@frogbotai/plugin-roles';
import type { Payload } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { FrogBot, getFrogBotPayload } from '../../packages/frogbot/src/frogbot.js';
import { Deals } from '../types/skill/scaffolds/automations/src/collections/Deals.js';
import { Tickets } from '../types/skill/scaffolds/automations/src/collections/Tickets.js';

const password = 'skill-automations-password';

describe('skill automations guide samples', () => {
  let dir: string;
  let frogbot: FrogBot;
  let payload: Payload;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'skill-automations-'));
    process.env.DEAL_WEBHOOK_URL = 'http://127.0.0.1:9/hook';

    const config = await buildConfig({
      secret: 'skill-automations-secret',
      db: sqliteAdapter({
        client: { url: `file:${path.join(dir, 'db.sqlite')}` },
        transactionOptions: {},
      }),
      typescript: { autoGenerate: false },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        {
          ...Tickets,
          hooks: {
            ...Tickets.hooks,
            afterChange: [
              ...(Tickets.hooks?.afterChange ?? []),
              ({ context, doc }) => {
                if (context.failAfter) throw new Error('later hook failed');

                return doc;
              },
            ],
          },
        },
        Deals,
      ],
      plugins: [
        rolesPlugin({
          roles: ['admin', 'agent'],
          rolesFieldAccess: { create: allow('admin'), update: allow('admin') },
        }),
      ],
      jobs: {
        workflows: [
          {
            slug: 'auto-solve',
            inputSchema: [
              { name: 'ticketId', type: 'text', required: true },
              { name: 'pendingSince', type: 'text', required: true },
            ],
            async handler({ waitFor }) {
              await waitFor('pending-48h', { until: new Date(Date.now() + 48 * 3600_000) });
            },
          },
        ],
        tasks: [
          {
            slug: 'send-webhook',
            inputSchema: [{ name: 'deliveryId', type: 'text', required: true }],
            handler: () => ({ output: {} }),
          },
        ],
        deleteJobOnComplete: false,
        jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
          ...defaultJobsCollection,
          access: {
            ...defaultJobsCollection.access,
            read: ({ req }) => {
              const roles = req.user && 'roles' in req.user ? req.user.roles : [];

              return Array.isArray(roles) && roles.includes('admin');
            },
          },
          admin: { ...defaultJobsCollection.admin, hidden: false },
        }),
      },
    });

    frogbot = await new FrogBot().init({ config, disableOnInit: true });
    payload = getFrogBotPayload(frogbot);
  });

  afterAll(async () => {
    await frogbot?.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await payload.db.deleteMany({ collection: 'payload-jobs', where: {} });
  });

  async function jobIds() {
    const { docs } = await payload.find({
      collection: 'payload-jobs',
      overrideAccess: true,
      pagination: false,
      sort: 'createdAt',
    });

    return docs.map((job) => job.jobId);
  }

  async function createTicket() {
    return await frogbot.create({
      collection: 'tickets',
      data: { subject: 'Printer', customerEmail: 'customer@example.com', status: 'open' },
      overrideAccess: true,
    });
  }

  async function setTicket(id: number | string, data: Record<string, unknown>) {
    await frogbot.update({ collection: 'tickets', id, data, overrideAccess: true });

    return await frogbot.findByID({ collection: 'tickets', id, overrideAccess: true });
  }

  it('queues one timer per stint in Pending', async () => {
    const ticket = await createTicket();
    const first = await setTicket(ticket.id, { status: 'pending' });

    await setTicket(ticket.id, { subject: 'Printer, still' });

    expect(await jobIds()).toEqual([`auto-solve:${ticket.id}:${first.pendingSince}`]);

    await setTicket(ticket.id, { status: 'open' });
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse(String(first.pendingSince)) + 60_000 });

    const second = await setTicket(ticket.id, { status: 'pending' }).finally(() =>
      vi.useRealTimers(),
    );

    expect(second.pendingSince).not.toBe(first.pendingSince);
    expect(await jobIds()).toEqual([
      `auto-solve:${ticket.id}:${first.pendingSince}`,
      `auto-solve:${ticket.id}:${second.pendingSince}`,
    ]);
  });

  it('gives a duplicated pending ticket its own 48 hours', async () => {
    const ticket = await createTicket();
    const first = await setTicket(ticket.id, { status: 'pending' });

    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse(String(first.pendingSince)) + 3600_000 });

    const copy = await frogbot
      .duplicate({ collection: 'tickets', id: ticket.id, overrideAccess: true })
      .finally(() => vi.useRealTimers());

    expect(copy.pendingSince).not.toBe(first.pendingSince);
    expect(await jobIds()).toContain(`auto-solve:${copy.id}:${copy.pendingSince}`);
  });

  it('keeps the stamp when a save tries to change it', async () => {
    const ticket = await createTicket();
    const first = await setTicket(ticket.id, { status: 'pending' });
    const after = await setTicket(ticket.id, { pendingSince: '2020-01-01T00:00:00.000Z' });

    expect(after.pendingSince).toBe(first.pendingSince);
  });

  it('leaves no job when the save fails', async () => {
    const ticket = await createTicket();

    await expect(
      frogbot.update({
        collection: 'tickets',
        id: ticket.id,
        data: { status: 'pending' },
        context: { failAfter: true },
        overrideAccess: true,
      }),
    ).rejects.toThrow('later hook failed');

    const saved = await frogbot.findByID({
      collection: 'tickets',
      id: ticket.id,
      overrideAccess: true,
    });

    expect(saved.status).toBe('open');
    expect(await jobIds()).toEqual([]);
  });

  it('sends one webhook for one move to Won', async () => {
    const deal = await frogbot.create({
      collection: 'deals',
      data: { name: 'Acme' },
      overrideAccess: true,
    });

    await frogbot.update({
      collection: 'deals',
      id: deal.id,
      data: { stage: 'won' },
      overrideAccess: true,
    });

    await frogbot.update({
      collection: 'deals',
      id: deal.id,
      data: { name: 'Acme Inc' },
      overrideAccess: true,
    });

    expect(await jobIds()).toHaveLength(1);
  });

  it('keeps run history from a user who tries to make themselves admin', async () => {
    await frogbot.jobs.queue({
      task: 'send-webhook',
      input: { deliveryId: 'customer-data' },
      overrideAccess: true,
    });

    const agent = await payload.create({
      collection: 'users',
      data: { email: 'agent@example.com', password, roles: ['agent'] },
      overrideAccess: true,
    });

    const user = { ...agent, collection: 'users' as const };

    await expect(
      payload.find({ collection: 'payload-jobs', user, overrideAccess: false }),
    ).rejects.toThrow();

    await payload
      .update({
        collection: 'users',
        id: agent.id,
        data: { roles: ['admin'] },
        user,
        overrideAccess: false,
      })
      .catch(() => undefined);

    const after = await payload.findByID({
      collection: 'users',
      id: agent.id,
      overrideAccess: true,
    });

    expect(after.roles).toEqual(['agent']);
    await expect(
      payload.find({
        collection: 'payload-jobs',
        user: { ...after, collection: 'users' },
        overrideAccess: false,
      }),
    ).rejects.toThrow();
  });
});
