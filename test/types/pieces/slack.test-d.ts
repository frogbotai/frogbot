import { createSlack } from '@frogbotai/piece-slack';
import { expectTypeOf } from 'vitest';

const slack = createSlack({ auth: { botToken: 'token' } });

const _reacted = slack.addReaction({
  input: { channel: 'C123', timestamp: '1712345678.123456', reaction: 'frog' },
});

expectTypeOf<Parameters<typeof slack.addReaction>[0]['input']>().toEqualTypeOf<{
  channel: string;
  timestamp: string;
  reaction: string;
  reactAsUser?: boolean | undefined;
}>();

expectTypeOf<Awaited<typeof _reacted>['ok']>().toEqualTypeOf<true>();

const _addReactionRejectsFindUserByEmailInput = () =>
  // @ts-expect-error addReaction does not accept findUserByEmail input
  slack.addReaction({ input: { email: 'ada@example.com' } });

expectTypeOf<keyof typeof slack.triggers>().toEqualTypeOf<
  | 'messageCreated'
  | 'channelMessageCreated'
  | 'directMessageCreated'
  | 'channelMentionCreated'
  | 'directMentionCreated'
  | 'reactionAdded'
  | 'reactionRemoved'
  | 'channelCreated'
  | 'channelCommandCreated'
  | 'directCommandCreated'
  | 'userJoined'
  | 'messageSaved'
  | 'customEmojiAdded'
  | 'modalInteraction'
>();

expectTypeOf(slack.triggers.reactionAdded.type).toEqualTypeOf<'app'>();
