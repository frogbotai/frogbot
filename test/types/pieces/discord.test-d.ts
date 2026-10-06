import { createDiscord } from '@frogbotai/piece-discord';
import { expectTypeOf } from 'vitest';

const discord = createDiscord({ auth: { botToken: 'token' } });

const sent = discord.sendWebhookMessage({
  input: { webhookUrl: 'https://discord.com/api/webhooks/1/token', content: 'Hello' },
});

expectTypeOf<Parameters<typeof discord.sendWebhookMessage>[0]['input']>().toEqualTypeOf<{
  webhookUrl: string;
  username?: string | undefined;
  content: string;
  avatarUrl?: string | undefined;
  embeds?: Record<string, unknown>[] | undefined;
  tts?: boolean | undefined;
}>();
expectTypeOf(sent).toEqualTypeOf<Promise<{ success: boolean }>>();

const _sendWebhookMessageRejectsRenameChannelInput = () =>
  // @ts-expect-error sendWebhookMessage does not accept renameChannel input
  discord.sendWebhookMessage({ input: { channelId: 'channel', name: 'general' } });

expectTypeOf<keyof typeof discord.triggers>().toEqualTypeOf<
  'commandReceived' | 'componentReceived' | 'messageCreated' | 'reactionAdded' | 'reactionRemoved'
>();
expectTypeOf(discord.triggers.reactionAdded.type).toEqualTypeOf<'app'>();
