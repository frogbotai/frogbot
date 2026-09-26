import type {
  ChannelQuestionCall,
  PieceChannelQuestions,
  QuestionInteraction,
  QuestionParseResult,
} from 'frogbot/pieces';

import { DISCORD_LIMITS, questionLayout, selectRange } from './components.js';
import { callKey, decodeQuestionId, snowflakeTime } from './ids.js';
import {
  type DiscordQuestionState,
  DOUBLE_PRESS_MS,
  isArmOpen,
  readState,
  userPicks,
  withoutExpiredArms,
  withoutPicks,
} from './state.js';

type ActionInteraction = Extract<QuestionInteraction, { type: 'action' }>;
type MessageInteraction = Extract<QuestionInteraction, { type: 'message' }>;
type ComponentPayload = { id?: unknown; data?: { values?: unknown } };

const ignore: QuestionParseResult = { kind: 'ignore' };

export const parseDiscordQuestion: PieceChannelQuestions['parse'] = ({
  call,
  interaction,
  settled,
  state,
}) => {
  if (interaction.type === 'action') {
    return parseAction({ call, interaction, state: readState(state) });
  }

  if (interaction.type === 'message' && !settled) {
    return parseReply({ call, interaction, state: readState(state) });
  }

  return ignore;
};

function parseAction({
  call,
  interaction,
  state: stored,
}: {
  call: ChannelQuestionCall;
  interaction: ActionInteraction;
  state: DiscordQuestionState;
}): QuestionParseResult {
  const control = decodeQuestionId(interaction.event.actionId);

  if (!control || control.key !== callKey(call.toolCallId) || control.q !== stored.q) {
    return ignore;
  }

  const item = call.input.questions[control.q];

  if (!item) return ignore;

  const raw = (interaction.event.raw ?? {}) as ComponentPayload;
  const userId = interaction.event.user.userId;
  const state = withoutExpiredArms({ now: snowflakeTime(raw.id), state: stored });
  const layout = questionLayout({ item, page: state.page });
  const shown = layout.kind === 'selects' ? layout.selects : [];

  if (control.verb === 'dismiss') return { kind: 'dismiss' };

  if (control.verb === 'option') {
    const valid = layout.kind === 'buttons' && item.options[control.n ?? -1] !== undefined;

    return valid ? choose({ call, indexes: [control.n!], state }) : ignore;
  }

  if (control.verb === 'select') {
    const n = control.n ?? -1;
    const indexes = selectedIndexes({ item, n, values: raw.data?.values });

    if (!shown.includes(n) || !indexes) return ignore;

    if (!item.multiple) {
      return indexes.length === 1 ? choose({ call, indexes, state }) : ignore;
    }

    const picks = { ...state.picks, [userId]: { ...state.picks[userId], [n]: indexes } };

    return { kind: 'partial', state: { ...state, picks } };
  }

  if (control.verb === 'submit') {
    if (!item.multiple) return ignore;

    const indexes = userPicks({ state, userId });

    if (indexes.length === 0) {
      const other = item.custom ? ', or press **Other…** to type an answer' : '';

      return { kind: 'rejected', reason: `Pick at least one option first${other}.` };
    }

    return choose({ call, indexes, state });
  }

  if (control.verb === 'custom') {
    const at = snowflakeTime(raw.id);

    if (!item.custom || !Number.isFinite(at)) return ignore;

    const { [userId]: arm, ...armed } = state.armed;
    const { [userId]: _picks, ...picks } = state.picks;

    if (arm && at - arm.at < DOUBLE_PRESS_MS) return ignore;

    const name = interaction.event.user.fullName || interaction.event.user.userName;

    const next = arm
      ? { ...state, armed, picks: { ...picks, [userId]: bySelect(arm.picks) } }
      : {
          ...state,
          picks,
          armed: { ...armed, [userId]: { at, name, picks: userPicks({ state, userId }) } },
        };

    return { kind: 'partial', state: withoutPicks({ selects: shown, state: next }) };
  }

  if (control.verb === 'page') {
    const page = control.n ?? -1;

    if (layout.kind !== 'selects' || page < 0 || page >= layout.pages || page === layout.page) {
      return ignore;
    }

    const next = questionLayout({ item, page });
    const selects = next.kind === 'selects' ? next.selects : [];

    return { kind: 'partial', state: withoutPicks({ selects, state: { ...state, page } }) };
  }

  return ignore;
}

function parseReply({
  call,
  interaction,
  state,
}: {
  call: ChannelQuestionCall;
  interaction: MessageInteraction;
  state: DiscordQuestionState;
}): QuestionParseResult {
  const { message } = interaction;
  const item = call.input.questions[state.q];
  const arm = state.armed[message.author.userId];
  const sent = new Date(message.metadata.dateSent).getTime();

  if (!item?.custom || !arm || !isArmOpen({ arm, at: sent })) return ignore;

  const text = withoutBotMentions(message).trim();

  if (!text) return { kind: 'rejected', reason: 'Type your answer as a message in this thread.' };

  const indexes = item.multiple ? userPicks({ state, userId: message.author.userId }) : [];

  return choose({ call, custom: text, indexes, state });
}

function bySelect(indexes: number[]): Record<string, number[]> {
  const groups: Record<string, number[]> = {};

  indexes.forEach((index) => {
    const n = Math.floor(index / DISCORD_LIMITS.selectOptions);

    groups[n] = [...(groups[n] ?? []), index];
  });

  return groups;
}

function withoutBotMentions(message: MessageInteraction['message']): string {
  const mentions = (
    message.raw as { mentions?: Array<{ id?: unknown; bot?: unknown }> } | undefined
  )?.mentions;
  const bots = new Set((mentions ?? []).filter(({ bot }) => bot === true).map(({ id }) => id));

  let text = message.text;

  for (;;) {
    const mention = /^\s*<@!?(\d+)>/.exec(text);

    if (!mention || !bots.has(mention[1])) return text;

    text = text.slice(mention[0].length);
  }
}

function selectedIndexes({
  item,
  n,
  values,
}: {
  item: ChannelQuestionCall['input']['questions'][number];
  n: number;
  values: unknown;
}): number[] | null {
  if (!Array.isArray(values)) return null;

  const [start, end] = selectRange({ item, n });

  const indexes = values.map((value) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : -1,
  );

  if (indexes.some((index) => index < start || index >= end)) return null;

  return [...new Set(indexes)].sort((a, b) => a - b);
}

function choose({
  call,
  custom,
  indexes,
  state,
}: {
  call: ChannelQuestionCall;
  custom?: string;
  indexes: number[];
  state: DiscordQuestionState;
}): QuestionParseResult {
  const { questions } = call.input;
  const item = questions[state.q]!;

  const selected = [...new Set(indexes)]
    .sort((a, b) => a - b)
    .map((index) => item.options[index]!.label);

  const answers = [
    ...state.answers.slice(0, state.q),
    { header: item.header, selected, ...(custom ? { custom } : {}) },
  ];

  if (answers.length === questions.length) return { kind: 'answer', output: { answers } };

  return {
    kind: 'partial',
    state: {
      q: state.q + 1,
      page: 0,
      answers,
      picks: {},
      armed: {},
    } satisfies DiscordQuestionState,
  };
}
