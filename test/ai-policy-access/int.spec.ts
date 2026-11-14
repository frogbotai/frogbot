import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const password = 'frogbot-test-password';

type Doc = { id: number | string; spendThisPeriodUSD?: number };

describe('spend follows the read access of its user or key', () => {
  let booted: BootedFrogBot;
  let alice: { id: number | string; headers: { Authorization: string } };
  let carol: Doc;
  let bob: Doc;
  let aliceKey: Doc;
  let bobKey: Doc;

  const member = async (email: string, tenant: string) => {
    const doc = await booted.frogbot.create({
      collection: 'members',
      data: { email, password, tenant },
      overrideAccess: true,
    });

    const login = await booted.restClient.post<{ token: string }>('/api/members/login', {
      email,
      password,
    });

    return { id: doc.id, headers: { Authorization: `JWT ${login.body.token}` } };
  };

  const mint = async (headers: Record<string, string>) => {
    const response = await booted.restClient.post<{ id: number | string }>(
      '/api/keys/mint',
      { name: 'Key' },
      { headers },
    );

    expect(response.status, JSON.stringify(response.body)).toBe(201);

    return { id: response.body.id };
  };

  const setSpend = (collection: 'members' | 'keys', id: number | string, amount: number) =>
    booted.frogbot.update({
      collection: 'plugin-ai-policy-spend',
      where: { key: { equals: `${collection}:${String(id)}` } },
      data: { amount },
      overrideAccess: true,
    });

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'ai-policy-access');
    await clearAndSeed(booted.frogbot, 'empty');

    alice = await member('alice@tenant-a.local', 'a');
    carol = await member('carol@tenant-a.local', 'a');
    const bobMember = await member('bob@tenant-b.local', 'b');

    bob = bobMember;
    aliceKey = await mint(alice.headers);
    bobKey = await mint(bobMember.headers);

    await setSpend('members', alice.id, 4);
    await setSpend('members', carol.id, 9);
    await setSpend('members', bob.id, 100);
    await setSpend('keys', aliceKey.id, 2);
    await setSpend('keys', bobKey.id, 50);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  it('shows spend on the members a user may read, sorted by spend', async () => {
    const list = await booted.restClient.get<{ docs: Doc[] }>(
      '/api/members?sort=-spendThisPeriodUSD&depth=0',
      { headers: alice.headers },
    );

    expect(list.status).toBe(200);
    expect(list.body.docs.map(({ id, spendThisPeriodUSD }) => [id, spendThisPeriodUSD])).toEqual([
      [carol.id, 9],
      [alice.id, 4],
    ]);
  });

  it("doesn't reveal another tenant's spend through a filter", async () => {
    const list = await booted.restClient.get<{ docs: Doc[] }>(
      '/api/members?where[spendThisPeriodUSD][greater_than]=50&depth=0',
      { headers: alice.headers },
    );

    expect(list.status).toBe(200);
    expect(list.body.docs).toEqual([]);
  });

  it('lists only the counters of members and keys the user may read', async () => {
    const list = await booted.restClient.get<{ docs: { key: string; amount: number }[] }>(
      '/api/plugin-ai-policy-spend?limit=100&depth=0',
      { headers: alice.headers },
    );

    expect(list.status).toBe(200);
    expect(list.body.docs.map(({ key }) => key).sort()).toEqual(
      [
        `keys:${String(aliceKey.id)}`,
        `members:${String(alice.id)}`,
        `members:${String(carol.id)}`,
      ].sort(),
    );
  });

  it("shows a key's spend to its owner and hides other members' keys", async () => {
    const own = await booted.restClient.get<Doc>(`/api/keys/${String(aliceKey.id)}?depth=0`, {
      headers: alice.headers,
    });

    const other = await booted.restClient.get<Doc>(`/api/keys/${String(bobKey.id)}?depth=0`, {
      headers: alice.headers,
    });

    expect(own.status).toBe(200);
    expect(own.body.spendThisPeriodUSD).toBe(2);
    expect(other.status).not.toBe(200);
  });

  it('refuses every counter to a signed-out request', async () => {
    const list = await booted.restClient.get<{ docs: unknown[] }>(
      '/api/plugin-ai-policy-spend?limit=100',
    );

    expect(list.status).toBe(403);
  });

  it("doesn't let a user write a counter", async () => {
    const write = await booted.restClient.post(
      '/api/plugin-ai-policy-spend',
      { key: `members:${String(alice.id)}x`, period: '2026-01', amount: -100 },
      { headers: alice.headers },
    );

    const update = await booted.restClient.patch(
      `/api/members/${String(alice.id)}`,
      { spendThisPeriodUSD: 0, spendCounter: null },
      { headers: alice.headers },
    );

    expect(write.status).toBe(403);
    expect(update.status).toBe(200);

    const after = await booted.restClient.get<Doc>(`/api/members/${String(alice.id)}?depth=0`, {
      headers: alice.headers,
    });

    expect(after.body.spendThisPeriodUSD).toBe(4);
  });

  it('deletes the counter with its member', async () => {
    const dave = await member('dave@tenant-a.local', 'a');

    await booted.frogbot.delete({ collection: 'members', id: dave.id, overrideAccess: true });

    const counters = await booted.frogbot.find({
      collection: 'plugin-ai-policy-spend',
      where: { key: { equals: `members:${String(dave.id)}` } },
      overrideAccess: true,
    });

    expect(counters.docs).toEqual([]);
  });
});
