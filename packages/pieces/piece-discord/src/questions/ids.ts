const PREFIX = 'fbq';
const DISCORD_EPOCH = 1_420_070_400_000n;

export type QuestionVerb = 'option' | 'select' | 'submit' | 'custom' | 'dismiss' | 'page';

export type QuestionControl = {
  key: string;
  q: number;
  verb: QuestionVerb;
  n?: number;
};

const codes: Record<QuestionVerb, string> = {
  option: 'o',
  select: 's',
  submit: 'ok',
  custom: 'x',
  dismiss: 'd',
  page: 'p',
};

const verbs = new Map(Object.entries(codes).map(([verb, code]) => [code, verb as QuestionVerb]));

export function callKey(toolCallId: string): string {
  let hash = 0x811c9dc5;

  for (const char of toolCallId) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

export function encodeQuestionId({
  key,
  n,
  q,
  verb,
}: {
  key: string;
  n?: number;
  q: number;
  verb: QuestionVerb;
}): string {
  return [PREFIX, key, q, codes[verb], ...(n === undefined ? [] : [n])].join(':');
}

export function decodeQuestionId(id: string): QuestionControl | null {
  const match = /^fbq:([0-9a-f]{8}):(\d+):([a-z]+)(?::(\d+))?$/.exec(id);

  if (!match) return null;

  const [, key, q, code, n] = match;
  const verb = verbs.get(code!);

  if (!verb) return null;

  return { key: key!, q: Number(q), verb, ...(n === undefined ? {} : { n: Number(n) }) };
}

export function snowflakeTime(id: unknown): number {
  if (typeof id !== 'string' || !/^\d{1,20}$/.test(id)) return Number.NaN;

  return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
}
