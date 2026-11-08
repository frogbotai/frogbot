export type SampleActivity = {
  title: string;
  type: 'call' | 'meeting' | 'demo' | 'event';
  day: number;
  hour: number;
  minute?: number;
  minutes: number;
  allDay?: boolean;
  deal?: string;
  contacts: string[];
};

export const ACTIVITIES: SampleActivity[] = [
  {
    title: 'Renewal terms call',
    type: 'call',
    day: 0,
    hour: 17,
    minutes: 30,
    deal: 'Lumen Labs renewal',
    contacts: ['Priya Raman'],
  },
  {
    title: 'Wholesale portal demo',
    type: 'demo',
    day: 1,
    hour: 18,
    minutes: 60,
    deal: 'Harbor & Pine wholesale portal',
    contacts: ['Marcus Bell'],
  },
  {
    title: 'Security review with Quillstone',
    type: 'meeting',
    day: 2,
    hour: 20,
    minutes: 90,
    deal: 'Quillstone clinic pilot',
    contacts: ['Dr. Elena Ortiz'],
  },
  {
    title: 'Intro call with Kestrel',
    type: 'call',
    day: 3,
    hour: 16,
    minute: 30,
    minutes: 30,
    deal: 'Kestrel fleet tracking',
    contacts: ['Grace Liu'],
  },
  {
    title: 'Brightfield kickoff',
    type: 'meeting',
    day: -2,
    hour: 21,
    minutes: 60,
    deal: 'Brightfield district rollout',
    contacts: ['Sam Whitaker'],
  },
  {
    title: 'Retail Summit',
    type: 'event',
    day: 6,
    hour: 0,
    minutes: 2 * 24 * 60,
    allDay: true,
    contacts: [],
  },
];
