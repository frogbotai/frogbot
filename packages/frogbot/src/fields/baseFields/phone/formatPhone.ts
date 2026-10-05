export type FormatPhoneArgs = {
  value: unknown;
};

const allowed = /^\+?[0-9 ().-]+$/;

export function getPhoneHref({ value }: FormatPhoneArgs): string | undefined {
  if (typeof value !== 'string' || !allowed.test(value)) return undefined;

  const digits = value.replace(/\D/g, '');

  if (digits.length < 7 || digits.length > 15) return undefined;

  return `tel:${value.startsWith('+') ? '+' : ''}${digits}`;
}

export function formatPhone({ value }: FormatPhoneArgs): string {
  if (typeof value !== 'string') return '';

  const digits = value.replace(/\D/g, '');

  if (!getPhoneHref({ value }) || value.startsWith('+') || digits.length !== 10) return value;

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
