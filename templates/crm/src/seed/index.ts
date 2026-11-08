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
 * and tasks. Every date is an offset from `today`. It creates no login: records are
 * owned by the signed-in user, or the first user. If it fails partway, it deletes the
 * records it added, so the CRM is empty again and the seed can be retried.
 */
export async function seed(args: SeedArgs): Promise<SeedResult> {
  const added: Added[] = [];

  try {
    return await addSample(args, added);
  } catch (err) {
    for (const { collection, id } of added.reverse()) {
      await args.frogbot
        .delete({ collection, id, overrideAccess: true, req: args.req })
        .catch((cleanupErr: unknown) =>
          args.frogbot.logger.error(
            { err: cleanupErr, collection, id },
            'Removing a partly added sample record failed',
          ),
        );
    }

    throw err;
  }
}

type Added = {
  collection: (typeof SAMPLE_COLLECTIONS)[number] | 'media';
  id: ID;
};

async function addSample(
  { frogbot, req, today }: SeedArgs,
  added: Added[],
): Promise<SeedResult> {
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

    added.push({ collection: 'media', id: media.id });
    result.logos.set(logo, media.id);

    const created = await frogbot.create({
      collection: 'companies',
      data: { ...company, logo: media.id, owner },
      ...options,
    });

    added.push({ collection: 'companies', id: created.id });
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

    added.push({ collection: 'contacts', id: created.id });
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

    added.push({ collection: 'deals', id: created.id });
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

    const created = await frogbot.create({
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

    added.push({ collection: 'activities', id: created.id });
  }

  for (const { dueInDays, deal, contact, ...task } of TASKS) {
    const created = await frogbot.create({
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

    added.push({ collection: 'tasks', id: created.id });
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
