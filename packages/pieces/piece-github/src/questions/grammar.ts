import type { QuestionInput, QuestionOutput } from 'frogbot/pieces';

type QuestionItem = QuestionInput['questions'][number];

type QuestionAnswer = Omit<QuestionOutput['answers'][number], 'header'>;

export type GithubCommand =
  { kind: 'none' } | { kind: 'answer'; rest: string } | { kind: 'dismiss'; rest: string };

const COMMAND = /^\/(answer|dismiss)(?=\s|$)/i;
const NUMBERS = /^\d+(?:(?:\s*,\s*|\s+)\d+)*$/;
const OPENING_QUOTE = /^["“”„]/;
const QUOTED = /^["“”„]([\s\S]*)["“”]$/;

export function readCommand(body: string): GithubCommand {
  const text = body.trim();
  const match = COMMAND.exec(text);

  if (!match) return { kind: 'none' };

  const kind = match[1]!.toLowerCase() as 'answer' | 'dismiss';

  return { kind, rest: text.slice(match[0].length).trim() };
}

export function readAnswer({
  item,
  text,
}: {
  item: QuestionItem;
  text: string;
}): QuestionAnswer | { reason: string } {
  if (!text) return { reason: 'Add your answer after /answer, for example /answer 1.' };

  const quoted = text.length > 1 ? QUOTED.exec(text) : null;

  if (quoted) return customAnswer({ item, text: quoted[1]!.trim(), quoted: true });

  if (OPENING_QUOTE.test(text) && item.custom) {
    return { reason: 'Put your whole answer between quotes, for example /answer "Teal".' };
  }

  if (/^\d/.test(text)) return selectedAnswer({ item, text });

  return customAnswer({ item, text, quoted: false });
}

function selectedAnswer({
  item,
  text,
}: {
  item: QuestionItem;
  text: string;
}): QuestionAnswer | { reason: string } {
  if (!NUMBERS.test(text)) {
    const example = item.multiple ? '/answer 1, 3' : '/answer 2';
    const custom = item.custom ? ' To answer in your own words, put your answer in quotes.' : '';

    return { reason: `Use option numbers only, for example ${example}.${custom}` };
  }

  const tokens = text.split(/[\s,]+/);
  const missing = tokens.find((token) => Number(token) < 1 || Number(token) > item.options.length);

  if (missing !== undefined) {
    return {
      reason: `There's no option ${missing}. Choose a number from 1 to ${item.options.length}.`,
    };
  }

  const indexes = [...new Set(tokens.map(Number))].sort((a, b) => a - b);

  if (indexes.length > 1 && !item.multiple) {
    return { reason: `“${item.header}” takes one answer. Reply with a single option number.` };
  }

  return { selected: indexes.map((index) => item.options[index - 1]!.label) };
}

function customAnswer({
  item,
  quoted,
  text,
}: {
  item: QuestionItem;
  quoted: boolean;
  text: string;
}): QuestionAnswer | { reason: string } {
  if (!item.custom) {
    return {
      reason: `“${item.header}” only accepts the listed options. Reply with an option number, for example /answer 1.`,
    };
  }

  if (!text && quoted) return { reason: 'Type your answer between the quotes.' };

  return { selected: [], custom: text };
}
