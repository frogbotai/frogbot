import type { Seeded } from '../seed';
import { cycle, la, longTitle } from '../shared';

const FIRST = ['Ava', 'Ben', 'Chloe', 'Dev', 'Ema', 'Finn', 'Gia', 'Hugo', 'Ines', 'Jon'];

const LAST = ['Ahmed', 'Brooks', 'Castillo', 'Dubois', 'Eriksen', 'Fischer'];

const TITLES = ['Buyer', 'CFO', 'Office Manager', 'Engineer', 'Director of Sales'];

/** 32 contacts: a 200-character name, one with no optional fields, and 30 more. */
export async function seedContacts({ frogbot, owner, companies, contacts }: Seeded) {
  const companyIds = [...companies.values()];

  const create = async (data: Parameters<typeof frogbot.create<'contacts'>>[0]['data']) => {
    const contact = await frogbot.create({ collection: 'contacts', data, overrideAccess: true });

    contacts.set(contact.name, contact.id);
  };

  await create({
    name: longTitle('Long name contact'),
    jobTitle: 'Buyer',
    company: companyIds[0],
    email: 'long@example.com',
    owner,
  });

  await create({ name: 'Minimal contact' });

  for (let index = 0; index < 30; index++) {
    const first = cycle(FIRST, index);
    const last = cycle(LAST, index + Math.floor(index / FIRST.length));

    await create({
      name: `${first} ${last}`,
      jobTitle: cycle(TITLES, index),
      company: cycle(companyIds, index),
      email: `${first}.${last}.${index}@example.com`.toLowerCase(),
      lastContacted: la(-index, 10),
      owner,
    });
  }
}
