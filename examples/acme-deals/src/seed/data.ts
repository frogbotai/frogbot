export const PASSWORD = 'acme-demo-password';

export const USERS = [
  { email: 'admin@acme.test', name: 'Alex Admin' },
  { email: 'sam@acme.test', name: 'Sam', monthlyBudget: 50 },
];

export type SampleDeal = {
  name: string;
  stage: 'lead' | 'proposal' | 'won' | 'lost';
  amount: number;
  closeInDays: number;
  owner: 'admin@acme.test' | 'sam@acme.test';
};

export const DEALS: SampleDeal[] = [
  {
    name: 'Globex renewal',
    stage: 'proposal',
    amount: 48_000,
    closeInDays: 9,
    owner: 'sam@acme.test',
  },
  {
    name: 'Initech',
    stage: 'proposal',
    amount: 22_500,
    closeInDays: 14,
    owner: 'admin@acme.test',
  },
  {
    name: 'Umbrella Corp pilot',
    stage: 'lead',
    amount: 12_000,
    closeInDays: 30,
    owner: 'sam@acme.test',
  },
  {
    name: 'Hooli expansion',
    stage: 'proposal',
    amount: 60_000,
    closeInDays: 21,
    owner: 'admin@acme.test',
  },
  {
    name: 'Stark Industries trial',
    stage: 'lead',
    amount: 8_000,
    closeInDays: 35,
    owner: 'sam@acme.test',
  },
  {
    name: 'Wayne Enterprises seats',
    stage: 'lead',
    amount: 15_500,
    closeInDays: 40,
    owner: 'admin@acme.test',
  },
  {
    name: 'Soylent onboarding',
    stage: 'won',
    amount: 31_000,
    closeInDays: 2,
    owner: 'sam@acme.test',
  },
  {
    name: 'Vandelay imports',
    stage: 'won',
    amount: 4_000,
    closeInDays: 5,
    owner: 'admin@acme.test',
  },
  {
    name: 'Cyberdyne support plan',
    stage: 'lost',
    amount: 27_000,
    closeInDays: 7,
    owner: 'sam@acme.test',
  },
  {
    name: 'Massive Dynamic API',
    stage: 'lead',
    amount: 39_000,
    closeInDays: 42,
    owner: 'admin@acme.test',
  },
];
