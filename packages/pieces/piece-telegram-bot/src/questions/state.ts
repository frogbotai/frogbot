import type { QuestionOutput } from 'frogbot/pieces';

export type TelegramQuestionAnswer = QuestionOutput['answers'][number];

export type TelegramSettledView = {
  actor?: string;
  answers?: TelegramQuestionAnswer[];
};

export type TelegramQuestionState = {
  q: number;
  page: number;
  answers: TelegramQuestionAnswer[];
  selected: number[];
  typing: boolean;
  settled?: TelegramSettledView;
};

export function initialState(): TelegramQuestionState {
  return { q: 0, page: 0, answers: [], selected: [], typing: false };
}

export function readState(state: unknown): TelegramQuestionState {
  if (!state || typeof state !== 'object') return initialState();

  const value = state as Partial<TelegramQuestionState>;

  const valid =
    isIndex(value.q) &&
    isIndex(value.page) &&
    Array.isArray(value.answers) &&
    Array.isArray(value.selected) &&
    typeof value.typing === 'boolean';

  return valid ? (value as TelegramQuestionState) : initialState();
}

function isIndex(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0;
}
