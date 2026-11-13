import type { Seeded } from '../seed';
import { cycle, longTitle } from '../shared';

const NAMES = [
  'Alder Analytics',
  'Bluegate Insurance',
  'Copperline Studios',
  'Driftwood Dental',
  'Evergreen Bakery Co.',
  'Foxglove Pharmacy',
  'Granite Peak Outfitters',
  'Hollow Creek Farms',
  'Ironwood Builders',
  'Juniper Learning',
  'Kite & Key Travel',
  'Lakeshore Clinics',
];

const LIFECYCLES = ['lead', 'prospect', 'customer'] as const;

const INDUSTRIES = [
  'software',
  'finance',
  'healthcare',
  'retail',
  'manufacturing',
  'education',
] as const;

/** 15 companies: a 200-character name, one with no optional fields, one with no logo, and 12 more. */
export async function seedCompanies({ frogbot, owner, logos, companies }: Seeded) {
  const logoIds = [...logos.values()];

  const create = async (
    data: Parameters<typeof frogbot.create<'companies'>>[0]['data'] & { name: string },
  ) => {
    const company = await frogbot.create({ collection: 'companies', data, overrideAccess: true });

    companies.set(data.name, company.id);
  };

  await create({
    name: longTitle('Long name company'),
    lifecycle: 'prospect',
    industry: 'software',
    logo: logoIds[0],
    owner,
  });

  await create({ name: 'Minimal company' });

  await create({
    name: 'No logo company',
    lifecycle: 'customer',
    industry: 'finance',
    website: 'https://nologo.example.com',
    employees: 12,
    owner,
  });

  for (const [index, name] of NAMES.entries()) {
    await create({
      name,
      lifecycle: cycle(LIFECYCLES, index),
      industry: cycle(INDUSTRIES, index),
      logo: cycle(logoIds, index + 1),
      employees: 10 + index * 37,
      owner,
    });
  }
}
