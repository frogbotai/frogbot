import type { QuestionMessage, QuestionOutput, QuestionRecord } from 'frogbot/pieces';

export type GithubQuestionState = {
  q: number;
  answers: QuestionOutput['answers'];
  by: string[];
  closed?: { by?: string; dismissed: boolean };
};

export function readState(state: unknown): GithubQuestionState {
  const value = (state && typeof state === 'object' ? state : {}) as Partial<GithubQuestionState>;

  return {
    q: value.q ?? 0,
    answers: value.answers ?? [],
    by: value.by ?? [],
    ...(value.closed ? { closed: value.closed } : {}),
  };
}

export function commentsFor({
  question,
  q,
}: {
  question: QuestionRecord;
  q: number;
}): QuestionMessage[] {
  return question.messages.filter((message) => (message.question ?? 0) === q);
}

export function predatesQuestion({
  commentId,
  question,
}: {
  commentId: string;
  question: QuestionRecord;
}): boolean {
  const [first] = commentsFor({ question, q: readState(question.state).q });

  if (!first || !isCommentId(first.id) || !isCommentId(commentId)) return false;

  return BigInt(commentId) < BigInt(first.id);
}

function isCommentId(id: string): boolean {
  return /^\d{1,20}$/.test(id);
}
