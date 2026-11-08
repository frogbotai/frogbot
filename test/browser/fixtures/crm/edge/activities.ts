import type { Seeded } from '../seed';
import { cycle, la, longTitle } from '../shared';

const TYPES = ['call', 'meeting', 'demo'] as const;

/** 22 activities: a 30-day campaign, late and overnight ones, all-day ones, and a month of others. */
export async function seedActivities({ frogbot, owner, deals, contacts }: Seeded) {
  const dealIds = [...deals.values()];
  const contactIds = [...contacts.values()];

  const create = (data: Parameters<typeof frogbot.create<'activities'>>[0]['data']) =>
    frogbot.create({ collection: 'activities', data, overrideAccess: true });

  await create({
    title: 'Summer outreach campaign',
    type: 'event',
    start: la(-14, 0),
    end: la(16, 0),
    allDay: true,
    owner,
  });

  await create({
    title: 'Overnight data migration',
    type: 'event',
    start: la(0, 22),
    end: la(1, 2),
  });

  await create({
    title: 'Late call with Sydney',
    type: 'call',
    start: la(2, 23, 30),
    end: la(3, 0, 30),
  });

  await create({
    title: '11:30pm check-in',
    type: 'call',
    start: la(-1, 23, 30),
    end: la(-1, 23, 50),
  });

  await create({ title: 'Release night', type: 'meeting', start: la(4, 23, 30), end: la(5, 1) });

  for (const [index, day] of [-3, 8, 12].entries()) {
    await create({
      title: cycle(['Team offsite', 'Trade show', 'Holiday'], index),
      type: 'event',
      start: la(day, 0),
      end: la(day + 1, 0),
      allDay: true,
    });
  }

  await create({
    title: longTitle('Long title activity'),
    type: 'meeting',
    start: la(1, 13),
    end: la(1, 14),
    deal: dealIds[0],
  });

  await create({ title: 'Minimal activity', start: la(3, 9) });

  for (let index = 0; index < 12; index++) {
    const day = -12 + index * 2;

    await create({
      title: `${cycle(['Check-in', 'Pricing review', 'Product demo'], index)} ${index + 1}`,
      type: cycle(TYPES, index),
      start: la(day, 9 + (index % 7)),
      end: la(day, 10 + (index % 7)),
      deal: cycle(dealIds, index),
      contacts: [cycle(contactIds, index)],
      owner,
    });
  }
}
