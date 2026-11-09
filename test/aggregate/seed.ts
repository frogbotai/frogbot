import type { FrogBotInstance } from 'frogbot';

import type { Account, Deal, User } from './frogbot-types.js';
import { accountsSlug, dealsSlug, usersSlug } from './shared.js';

export type AggregateSeed = {
  users: { ana: User; bo: User; cy: User };
  accounts: { acme: Account; hidden: Account };
  deals: Deal[];
};

/** Four published deals, one draft and one trashed deal, across three users and two accounts. */
export async function seedDeals(frogbot: FrogBotInstance, run: number): Promise<AggregateSeed> {
  const user = (name: string, team: 'red' | 'blue', role: 'admin' | 'member' | 'guest') =>
    frogbot.create({
      collection: usersSlug,
      data: { email: `${name}-${run}@example.com`, password: 'password', name, team, role },
      overrideAccess: true,
    });

  const ana = await user('Ana', 'red', 'admin');
  const bo = await user('Bo', 'blue', 'guest');
  const cy = await user('Cy', 'red', 'member');

  const account = (name: string, tier: 'gold' | 'silver', visible: boolean) =>
    frogbot.create({
      collection: accountsSlug,
      data: { name, tier, visible },
      overrideAccess: true,
    });

  const acme = await account('Acme', 'gold', true);
  const hidden = await account('Hidden Co', 'silver', false);

  const deal = (data: Partial<Deal>, draft = false) =>
    frogbot.create({
      collection: dealsSlug,
      data: { _status: draft ? 'draft' : 'published', ...data },
      draft,
      overrideAccess: true,
    });

  const deals = [
    await deal({
      title: 'd1',
      stage: 'lead',
      amount: 100,
      closedAt: '2025-12-29T10:00:00.000Z',
      won: false,
      owner: ana.id,
      account: acme.id,
      tags: ['hot', 'big', 'cold'],
      region: 'north',
      margin: 10,
      secret: 1,
      audit: 5,
      details: { probability: 0.5 },
      watchers: [bo.id, cy.id],
      lines: [{ product: 'a' }, { product: 'b' }, { product: 'a' }],
    }),
    await deal({
      title: 'd2',
      stage: 'won',
      amount: 300,
      closedAt: '2026-01-04T23:00:00.000Z',
      won: true,
      owner: bo.id,
      account: hidden.id,
      tags: ['hot'],
      region: 'south',
      margin: 20,
      confidential: true,
      audit: 1000,
      details: { probability: 0.25 },
      watchers: [ana.id, cy.id],
      lines: [{ product: 'a' }],
    }),
    await deal({
      title: 'd3',
      stage: 'won',
      amount: 600,
      closedAt: '2026-01-05T00:00:00.000Z',
      won: true,
      owner: cy.id,
      account: acme.id,
      region: 'north',
      audit: 7,
    }),
    await deal({ title: 'd4', stage: 'lead', won: false, tags: ['cold'] }),
    await deal({ title: 'd5', stage: 'won', amount: 1000, owner: ana.id }, true),
    await deal({ title: 'd6', stage: 'lost', amount: 50, owner: ana.id }),
  ];

  await frogbot.update({
    collection: dealsSlug,
    id: deals[0].id,
    locale: 'fr',
    data: { region: 'nord', _status: 'published' },
    overrideAccess: true,
  });

  await frogbot.update({
    collection: dealsSlug,
    id: deals[5].id,
    data: { deletedAt: new Date().toISOString(), _status: 'published' },
    overrideAccess: true,
  });

  return { users: { ana, bo, cy }, accounts: { acme, hidden }, deals };
}
