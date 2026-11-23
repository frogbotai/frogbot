export const PASSWORD = 'mow-money-demo';

export const USERS = [
  { email: 'ray@mowmoney.test', name: 'Uncle Ray' },
  { email: 'tyler@mowmoney.test', name: 'Tyler', monthlyBudget: 20 },
];

export type SampleJob = {
  customer: string;
  price: number;
  stage: 'quoted' | 'scheduled' | 'mowed' | 'paid';
};

export const JOBS: SampleJob[] = [
  { customer: 'Mrs. Patel, front yard', price: 45, stage: 'scheduled' },
  { customer: 'The Hendersons', price: 60, stage: 'scheduled' },
  { customer: 'Mr. Kim, backyard', price: 40, stage: 'mowed' },
  { customer: 'Riverside Church lawn', price: 180, stage: 'mowed' },
  { customer: 'Oak Street HOA', price: 350, stage: 'mowed' },
  { customer: 'Dr. Alvarez', price: 55, stage: 'paid' },
  { customer: 'The Lopez family', price: 45, stage: 'paid' },
  { customer: 'Greenfield Park', price: 900, stage: 'quoted' },
  { customer: 'Ms. Nguyen, front and back', price: 75, stage: 'quoted' },
  { customer: 'Sunset Apartments', price: 420, stage: 'quoted' },
];
