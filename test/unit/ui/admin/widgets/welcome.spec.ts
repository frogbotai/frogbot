import { describe, expect, it } from 'vitest';

import { firstName } from '../../../../../packages/ui/src/admin/widgets/Welcome/firstName';
import { partOfDay } from '../../../../../packages/ui/src/admin/widgets/Welcome/Greeting.client';

describe('firstName', () => {
  it('takes the first word of a name', () => {
    expect(firstName({ email: 'ada@example.com', title: '  Ada Lovelace ' })).toBe('Ada');
  });

  it('takes the part before the @ when the name is an email or missing', () => {
    expect(firstName({ email: 'ada@example.com', title: 'ada@example.com' })).toBe('ada');
    expect(firstName({ email: 'ada@example.com', title: '' })).toBe('ada');
    expect(firstName({ email: 'ada@example.com' })).toBe('ada');
  });

  it('cuts at the @ only when the whole name is an email', () => {
    expect(firstName({ email: 'ada@example.com', title: 'Ada Lovelace @ Acme' })).toBe('Ada');
    expect(firstName({ email: 'ada@example.com', title: '@' })).toBe('ada');
  });

  it('falls back to the username, and to nothing', () => {
    expect(firstName({ username: 'grace' })).toBe('grace');
    expect(firstName({})).toBeUndefined();
  });
});

describe('partOfDay', () => {
  it('says morning from midnight to noon, afternoon until 6pm, evening after', () => {
    expect([0, 3, 11, 12, 17, 18, 23].map(partOfDay)).toEqual([
      'morning',
      'morning',
      'morning',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
    ]);
  });
});
