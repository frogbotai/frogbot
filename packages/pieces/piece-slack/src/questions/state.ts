export type SlackQuestionState = {
  custom?: Record<string, Record<string, string>>;
};

export function customAnswers({
  state,
  userId,
}: {
  state?: SlackQuestionState;
  userId: string;
}): Record<string, string> {
  return state?.custom?.[userId] ?? {};
}

export function withCustomAnswer({
  q,
  state,
  text,
  userId,
}: {
  q: number;
  state?: SlackQuestionState;
  text: string;
  userId: string;
}): SlackQuestionState {
  const { [q]: _previous, ...rest } = customAnswers({ state, userId });
  const answers = text ? { ...rest, [q]: text } : rest;

  return { ...state, custom: { ...state?.custom, [userId]: answers } };
}
