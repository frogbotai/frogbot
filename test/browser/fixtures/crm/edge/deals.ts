import type { Seeded } from '../seed';
import { cycle, la, longTitle } from '../shared';

/** The `lead` column ends with exactly this many cards, past the board's 50-card page. */
export const LEAD_COLUMN_SIZE = 60;

/** 59 deals: leads to fill the column to 60 (one with no optional fields), and a 200-character name. */
export async function seedDeals({ frogbot, owner, companies, contacts, deals }: Seeded) {
  const companyIds = [...companies.values()];
  const contactIds = [...contacts.values()];

  const create = async (data: Parameters<typeof frogbot.create<'deals'>>[0]['data']) => {
    const deal = await frogbot.create({ collection: 'deals', data, overrideAccess: true });

    deals.set(deal.name, deal.id);
  };

  await create({
    name: longTitle('Long name deal'),
    stage: 'proposal',
    company: companyIds[0],
    amount: 123_456,
    closeDate: la(10, 12),
    owner,
  });

  await create({ name: 'Minimal deal' });

  const { totalDocs: leads } = await frogbot.count({
    collection: 'deals',
    where: { stage: { equals: 'lead' } },
    overrideAccess: true,
  });

  for (let index = 0; leads + index < LEAD_COLUMN_SIZE; index++) {
    await create({
      name: `Inbound lead ${String(index + 1).padStart(2, '0')}`,
      stage: 'lead',
      company: cycle(companyIds, index),
      contact: cycle(contactIds, index),
      amount: 1_000 + index * 250,
      closeDate: la(index - 10, 12),
      owner,
    });
  }
}
