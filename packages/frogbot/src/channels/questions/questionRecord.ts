import type { QuestionChange, QuestionRecord, StoredQuestion } from './types.js';

export function toQuestionRecord({ messages, revision, state }: StoredQuestion): QuestionRecord {
  return { messages, revision, state };
}

export function applyQuestionChange({
  change,
  question,
}: {
  change: QuestionChange | void;
  question: StoredQuestion;
}): StoredQuestion {
  const { pending: _pending, ...current } = question;

  return {
    ...current,
    ...(change?.messages ? { messages: change.messages } : {}),
    ...(change?.state === undefined ? {} : { state: change.state }),
  };
}
