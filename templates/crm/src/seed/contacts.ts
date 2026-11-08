export type SampleContact = {
  name: string;
  jobTitle: string;
  company: string;
  email: string;
  phone: string;
  lastContactedDaysAgo: number;
};

export const CONTACTS: SampleContact[] = [
  {
    name: 'Priya Raman',
    jobTitle: 'Head of Operations',
    company: 'Lumen Labs',
    email: 'priya@lumenlabs.example.com',
    phone: '+1 415 555 0142',
    lastContactedDaysAgo: 2,
  },
  {
    name: 'Marcus Bell',
    jobTitle: 'Wholesale Director',
    company: 'Harbor & Pine',
    email: 'marcus@harborandpine.example.com',
    phone: '+1 207 555 0187',
    lastContactedDaysAgo: 1,
  },
  {
    name: 'Dr. Elena Ortiz',
    jobTitle: 'Chief Medical Officer',
    company: 'Quillstone Health',
    email: 'elena.ortiz@quillstone.example.com',
    phone: '+1 617 555 0123',
    lastContactedDaysAgo: 6,
  },
  {
    name: 'Sam Whitaker',
    jobTitle: 'IT Coordinator',
    company: 'Brightfield Schools',
    email: 'swhitaker@brightfield.example.com',
    phone: '+1 503 555 0164',
    lastContactedDaysAgo: 9,
  },
  {
    name: 'Grace Liu',
    jobTitle: 'VP Logistics',
    company: 'Kestrel Freight',
    email: 'grace.liu@kestrelfreight.example.com',
    phone: '+1 312 555 0199',
    lastContactedDaysAgo: 3,
  },
  {
    name: 'Tomás Herrera',
    jobTitle: 'Founder',
    company: 'Orbit Finance',
    email: 'tomas@orbitfinance.example.com',
    phone: '+1 646 555 0110',
    lastContactedDaysAgo: 4,
  },
  {
    name: 'Nora Feld',
    jobTitle: 'Owner',
    company: 'Cedar Row Goods',
    email: 'nora@cedarrow.example.com',
    phone: '+1 802 555 0135',
    lastContactedDaysAgo: 40,
  },
  {
    name: 'Kenji Watanabe',
    jobTitle: 'Plant Manager',
    company: 'Tidewater Robotics',
    email: 'kenji@tidewater.example.com',
    phone: '+1 206 555 0158',
    lastContactedDaysAgo: 5,
  },
];
