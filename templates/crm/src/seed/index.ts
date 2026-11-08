import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FrogBotInstance, FrogBotRequest, TypedUser } from 'frogbot';

import { ACTIVITIES } from './activities';
import { COMPANIES } from './companies';
import { CONTACTS } from './contacts';
import { at } from './dates';
import { DEALS } from './deals';
import { TASKS } from './tasks';

/** The collections the sample fills. The seed only runs while all of them are empty. */
export const SAMPLE_COLLECTIONS = [
  'companies',
  'contacts',
  'deals',
  'activities',
  'tasks',
] as const;

export type SeedArgs = {
  frogbot: FrogBotInstance;
  req?: FrogBotRequest;
  today: Date;
};

type ID = TypedUser['id'];

export type SeedResult = {
  companies: Map<string, ID>;
  contacts: Map<string, ID>;
  deals: Map<string, ID>;
  logos: Map<string, ID>;
  owner?: ID;
};

const LOGOS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'logos',
);

/** Whether any collection the sample fills already has a record. */
export async function hasRecords(frogbot: FrogBotInstance): Promise<boolean> {
  const counts = await Promise.all(
    SAMPLE_COLLECTIONS.map((collection) =>
      frogbot.count({ collection, overrideAccess: true }),
    ),
  );

  return counts.some(({ totalDocs }) => totalDocs > 0);
}

/**
 * Adds a small sales team's week: companies with logos, contacts, deals, activities
 * and tasks. Every date is an offset from `today`. It never deletes anything and
 * creates no login: records are owned by the signed-in user, or the first user.
 */
export async function seed({
  frogbot,
  req,
  today,
}: SeedArgs): Promise<SeedResult> {
  const options = { overrideAccess: true, req };
  const owner = req?.user?.id ?? (await firstUser(frogbot));

  const result: SeedResult = {
    companies: new Map(),
    contacts: new Map(),
    deals: new Map(),
    logos: new Map(),
    owner,
  };

  for (const { logo, ...company } of COMPANIES) {
    const media = await frogbot.create({
      collection: 'media',
      data: { alt: `${company.name} logo` },
      filePath: path.join(LOGOS_DIR, logo),
      ...options,
    });

    result.logos.set(logo, media.id);

    const created = await frogbot.create({
      collection: 'companies',
      data: { ...company, logo: media.id, owner },
      ...options,
    });

    result.companies.set(company.name, created.id);
  }

  for (const { company, lastContactedDaysAgo, ...contact } of CONTACTS) {
    const created = await frogbot.create({
      collection: 'contacts',
      data: {
        ...contact,
        company: result.companies.get(company),
        lastContacted: at(today, -lastContactedDaysAgo),
        owner,
      },
      ...options,
    });

    result.contacts.set(contact.name, created.id);
  }

  for (const { company, contact, closeInDays, ...deal } of DEALS) {
    const created = await frogbot.create({
      collection: 'deals',
      data: {
        ...deal,
        company: result.companies.get(company),
        contact: result.contacts.get(contact),
        closeDate: at(today, closeInDays),
        owner,
      },
      ...options,
    });

    result.deals.set(deal.name, created.id);
  }

  for (const {
    day,
    hour,
    minute = 0,
    minutes,
    deal,
    contacts,
    ...activity
  } of ACTIVITIES) {
    const start = at(today, day, hour, minute);

    await frogbot.create({
      collection: 'activities',
      data: {
        ...activity,
        start,
        end: new Date(Date.parse(start) + minutes * 60 * 1000).toISOString(),
        deal: deal ? result.deals.get(deal) : undefined,
        contacts: contacts.map((name) => result.contacts.get(name)!),
        owner,
      },
      ...options,
    });
  }

  for (const { dueInDays, deal, contact, ...task } of TASKS) {
    await frogbot.create({
      collection: 'tasks',
      data: {
        ...task,
        completed: task.status === 'done',
        dueDate: at(today, dueInDays),
        deal: deal ? result.deals.get(deal) : undefined,
        contact: contact ? result.contacts.get(contact) : undefined,
        assignee: owner,
      },
      ...options,
    });
  }

  return result;
}

async function firstUser(frogbot: FrogBotInstance) {
  const { docs } = await frogbot.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    sort: 'createdAt',
    overrideAccess: true,
  });

  return docs[0]?.id;
}
