import { describe, expect, it } from 'vitest';

import {
  formatPhone,
  getPhoneHref,
} from '../../../../../packages/frogbot/src/fields/baseFields/phone/formatPhone.js';

describe('getPhoneHref and formatPhone', () => {
  it.each([
    ['5551234567', 'tel:5551234567', '(555) 123-4567'],
    ['555.123.4567', 'tel:5551234567', '(555) 123-4567'],
    ['(555) 123-4567', 'tel:5551234567', '(555) 123-4567'],
    ['555-123-4567', 'tel:5551234567', '(555) 123-4567'],
    ['+44 20 7946 0958', 'tel:+442079460958', '+44 20 7946 0958'],
    ['+1 (415) 555-9876', 'tel:+14155559876', '+1 (415) 555-9876'],
    ['+1234567890', 'tel:+1234567890', '+1234567890'],
    ['1234567', 'tel:1234567', '1234567'],
    ['123456789012345', 'tel:123456789012345', '123456789012345'],
  ])('links %j to %j and shows %j', (value, href, shown) => {
    expect(getPhoneHref({ value })).toBe(href);
    expect(formatPhone({ value })).toBe(shown);
  });

  it.each([
    'call me',
    '123',
    '123456',
    '1234567890123456',
    '555-1234 x12',
    '44+20 7946 0958',
    '++44 20 7946 0958',
    '555_123_4567',
    '５５５１２３４５６７',
    '555\t1234567',
    '',
  ])('rejects %j and shows it as typed', (value) => {
    expect(getPhoneHref({ value })).toBeUndefined();
    expect(formatPhone({ value })).toBe(value);
  });

  it.each([null, undefined, 5551234567])('gives nothing for the non-text value %j', (value) => {
    expect(getPhoneHref({ value })).toBeUndefined();
    expect(formatPhone({ value })).toBe('');
  });
});
