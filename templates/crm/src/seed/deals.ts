import { paragraphs } from './richText';

export type DealStage =
  'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

export type SampleDeal = {
  name: string;
  company: string;
  contact: string;
  stage: DealStage;
  amount: number;
  closeInDays: number;
  notes?: ReturnType<typeof paragraphs>;
};

export const DEALS: SampleDeal[] = [
  {
    name: 'Lumen Labs renewal',
    company: 'Lumen Labs',
    contact: 'Priya Raman',
    stage: 'negotiation',
    amount: 48_000,
    closeInDays: 9,
    notes: paragraphs(
      'Two more seats for the support team. Wants net-60 terms.',
    ),
  },
  {
    name: 'Harbor & Pine wholesale portal',
    company: 'Harbor & Pine',
    contact: 'Marcus Bell',
    stage: 'proposal',
    amount: 22_500,
    closeInDays: 18,
  },
  {
    name: 'Quillstone clinic pilot',
    company: 'Quillstone Health',
    contact: 'Dr. Elena Ortiz',
    stage: 'qualified',
    amount: 60_000,
    closeInDays: 35,
    notes: paragraphs(
      'Pilot at two clinics first. Security review is the long pole.',
    ),
  },
  {
    name: 'Brightfield district rollout',
    company: 'Brightfield Schools',
    contact: 'Sam Whitaker',
    stage: 'won',
    amount: 36_000,
    closeInDays: -4,
  },
  {
    name: 'Kestrel fleet tracking',
    company: 'Kestrel Freight',
    contact: 'Grace Liu',
    stage: 'lead',
    amount: 95_000,
    closeInDays: 60,
  },
  {
    name: 'Orbit Finance starter plan',
    company: 'Orbit Finance',
    contact: 'Tomás Herrera',
    stage: 'lead',
    amount: 4_800,
    closeInDays: 30,
  },
  {
    name: 'Cedar Row winback',
    company: 'Cedar Row Goods',
    contact: 'Nora Feld',
    stage: 'lost',
    amount: 7_200,
    closeInDays: -12,
    notes: paragraphs('Chose to stay on spreadsheets for now.'),
  },
  {
    name: 'Tidewater second plant',
    company: 'Tidewater Robotics',
    contact: 'Kenji Watanabe',
    stage: 'proposal',
    amount: 54_000,
    closeInDays: 21,
  },
];
