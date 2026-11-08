import { paragraphs } from './richText';

export type SampleCompany = {
  name: string;
  logo: string;
  lifecycle: 'lead' | 'prospect' | 'customer' | 'churned';
  industry:
    | 'software'
    | 'finance'
    | 'healthcare'
    | 'retail'
    | 'manufacturing'
    | 'education';
  website: string;
  employees: number;
  notes?: ReturnType<typeof paragraphs>;
};

export const COMPANIES: SampleCompany[] = [
  {
    name: 'Lumen Labs',
    logo: 'lumen-labs.webp',
    lifecycle: 'customer',
    industry: 'software',
    website: 'https://lumenlabs.example.com',
    employees: 120,
    notes: paragraphs(
      'Signed the annual plan in March. Priya runs the rollout on their side.',
      'Renewal conversation starts next quarter.',
    ),
  },
  {
    name: 'Harbor & Pine',
    logo: 'harbor-and-pine.webp',
    lifecycle: 'prospect',
    industry: 'retail',
    website: 'https://harborandpine.example.com',
    employees: 45,
    notes: paragraphs(
      'Twelve stores on the coast. Wants one view of wholesale accounts.',
    ),
  },
  {
    name: 'Quillstone Health',
    logo: 'quillstone-health.webp',
    lifecycle: 'prospect',
    industry: 'healthcare',
    website: 'https://quillstone.example.com',
    employees: 860,
  },
  {
    name: 'Brightfield Schools',
    logo: 'brightfield-schools.webp',
    lifecycle: 'customer',
    industry: 'education',
    website: 'https://brightfield.example.com',
    employees: 300,
  },
  {
    name: 'Kestrel Freight',
    logo: 'kestrel-freight.webp',
    lifecycle: 'lead',
    industry: 'manufacturing',
    website: 'https://kestrelfreight.example.com',
    employees: 1500,
  },
  {
    name: 'Orbit Finance',
    logo: 'orbit-finance.webp',
    lifecycle: 'lead',
    industry: 'finance',
    website: 'https://orbitfinance.example.com',
    employees: 70,
  },
  {
    name: 'Cedar Row Goods',
    logo: 'cedar-row-goods.webp',
    lifecycle: 'prospect',
    industry: 'retail',
    website: 'https://cedarrow.example.com',
    employees: 25,
    notes: paragraphs(
      'Trialled us last year, then stayed on spreadsheets. Check back in autumn.',
    ),
  },
  {
    name: 'Tidewater Robotics',
    logo: 'tidewater-robotics.webp',
    lifecycle: 'customer',
    industry: 'manufacturing',
    website: 'https://tidewater.example.com',
    employees: 210,
  },
];
