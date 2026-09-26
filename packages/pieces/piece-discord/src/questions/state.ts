import type { QuestionOutput } from 'frogbot/pieces';

export const ARM_WINDOW_MS = 10 * 60_000;
export const DOUBLE_PRESS_MS = 3_000;

export type DiscordQuestionArm = { at: number; name?: string; picks: number[] };

export type DiscordQuestionState = {
  q: number;
  page: number;
  answers: QuestionOutput['answers'];
  picks: Record<string, Record<string, number[]>>;
  armed: Record<string, DiscordQuestionArm>;
};

export function readState(state: unknown): DiscordQuestionState {
  const value = (state && typeof state === 'object' ? state : {}) as Partial<DiscordQuestionState>;

  return {
    q: value.q ?? 0,
    page: value.page ?? 0,
    answers: value.answers ?? [],
    picks: value.picks ?? {},
    armed: value.armed ?? {},
  };
}

export function userPicks({
  state,
  userId,
}: {
  state: DiscordQuestionState;
  userId: string;
}): number[] {
  const selects = Object.values(state.picks[userId] ?? {});
  const kept = state.armed[userId]?.picks ?? [];

  return [...new Set([...kept, ...selects.flat()])].sort((a, b) => a - b);
}

export function withoutPicks({
  selects,
  state,
}: {
  selects: number[];
  state: DiscordQuestionState;
}): DiscordQuestionState {
  const picks = Object.fromEntries(
    Object.entries(state.picks).flatMap(([userId, bySelect]) => {
      const kept = Object.entries(bySelect).filter(([n]) => !selects.includes(Number(n)));

      return kept.length > 0 ? [[userId, Object.fromEntries(kept)]] : [];
    }),
  );

  return { ...state, picks };
}

export function withoutExpiredArms({
  now,
  state,
}: {
  now: number;
  state: DiscordQuestionState;
}): DiscordQuestionState {
  if (!Number.isFinite(now)) return state;

  const armed = Object.fromEntries(
    Object.entries(state.armed).filter(([, arm]) => now - arm.at <= ARM_WINDOW_MS),
  );

  return { ...state, armed };
}

export function isArmOpen({ arm, at }: { arm: DiscordQuestionArm; at: number }): boolean {
  return at >= arm.at && at - arm.at <= ARM_WINDOW_MS;
}
