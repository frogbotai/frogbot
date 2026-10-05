import { describe, expect, it } from 'vitest';

import { getUrlHref } from '../../../../../packages/frogbot/src/fields/baseFields/url/getUrlHref.js';

describe('getUrlHref', () => {
  it.each([
    'https://example.com',
    'http://example.com',
    'HTTPS://Example.com/Path',
    'http://localhost:3000',
    'http://[::1]:3000',
    'https://example.com/a?b=c#d',
    'https://user@example.com',
  ])('links the full URL %j as stored', (value) => {
    expect(getUrlHref({ value })).toBe(value);
  });

  it.each([
    'example.com',
    'www.example.com/pricing',
    'example.com/pricing',
    'example.com:8080/x',
    '192.168.0.1:8080',
    'sub.example.co.uk?q=1',
    '例え.jp',
  ])('opens the bare value %j with https://', (value) => {
    expect(getUrlHref({ value })).toBe(`https://${value}`);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,hi',
    'mailto:a@b.com',
    'ftp://example.com',
    'tel:5551234567',
    'file:///etc/passwd',
  ])('rejects the other scheme in %j', (value) => {
    expect(getUrlHref({ value })).toBeUndefined();
  });

  it.each([
    'a b.com',
    ' example.com',
    'example.com ',
    'example.com\n',
    'https://exa mple.com',
    'https://example.com\u0000',
    'https://example.com/\u009f',
    'example\u00a0.com',
  ])('rejects whitespace or control characters in %j', (value) => {
    expect(getUrlHref({ value })).toBeUndefined();
  });

  it.each(['localhost:3000', 'localhost', 'example'])(
    'rejects the bare host %j without a dot',
    (value) => {
      expect(getUrlHref({ value })).toBeUndefined();
    },
  );

  it.each(['user@example.com', 'user:pass@example.com'])(
    'rejects the bare value %j with user info',
    (value) => {
      expect(getUrlHref({ value })).toBeUndefined();
    },
  );

  it.each([
    '//example.com',
    '/pricing',
    '.com',
    'https://',
    'https:example.com',
    'https:/example.com',
    'example.com:99999',
    'example.com:abc',
  ])('rejects %j', (value) => {
    expect(getUrlHref({ value })).toBeUndefined();
  });

  it.each(['', 42, null, undefined])('rejects the empty or non-text value %j', (value) => {
    expect(getUrlHref({ value })).toBeUndefined();
  });
});
