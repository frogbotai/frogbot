export type ParseResult<T> = { error: string; success: false } | { success: true; value: T };

export const parseString = (raw: string): ParseResult<string> => ({ success: true, value: raw });

export const parseNumber = (raw: string): ParseResult<number> => {
  const value = Number(raw);

  return Number.isNaN(value)
    ? { error: 'must be a number', success: false }
    : { success: true, value };
};

const trueValues = new Set(['1', 'on', 't', 'true', 'y', 'yes']);
const falseValues = new Set(['0', 'f', 'false', 'n', 'no', 'off']);

export const parseBoolean = (raw: string): ParseResult<boolean> => {
  const value = raw.toLowerCase();

  if (trueValues.has(value)) return { success: true, value: true };
  if (falseValues.has(value)) return { success: true, value: false };

  return { error: 'must be a boolean', success: false };
};

export const parseEnum = <T extends string>(values: readonly T[], raw: string): ParseResult<T> =>
  values.includes(raw as T)
    ? { success: true, value: raw as T }
    : { error: `must be one of: ${values.join(', ')}`, success: false };
