export type SampleTask = {
  title: string;
  status: 'todo' | 'in-progress' | 'waiting' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueInDays: number;
  deal?: string;
  contact?: string;
};

export const TASKS: SampleTask[] = [
  {
    title: 'Send the revised renewal quote',
    status: 'in-progress',
    priority: 'high',
    dueInDays: 1,
    deal: 'Lumen Labs renewal',
    contact: 'Priya Raman',
  },
  {
    title: 'Prepare the wholesale portal demo',
    status: 'todo',
    priority: 'high',
    dueInDays: 1,
    deal: 'Harbor & Pine wholesale portal',
  },
  {
    title: 'Fill in the Quillstone security questionnaire',
    status: 'waiting',
    priority: 'medium',
    dueInDays: 5,
    deal: 'Quillstone clinic pilot',
    contact: 'Dr. Elena Ortiz',
  },
  {
    title: 'Book onboarding sessions for Brightfield',
    status: 'done',
    priority: 'medium',
    dueInDays: -1,
    deal: 'Brightfield district rollout',
  },
  {
    title: 'Research Kestrel’s current tracking setup',
    status: 'todo',
    priority: 'low',
    dueInDays: 3,
    deal: 'Kestrel fleet tracking',
    contact: 'Grace Liu',
  },
  {
    title: 'Draft the Tidewater proposal',
    status: 'in-progress',
    priority: 'medium',
    dueInDays: 4,
    deal: 'Tidewater second plant',
    contact: 'Kenji Watanabe',
  },
];
