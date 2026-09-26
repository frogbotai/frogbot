import {
  TelegramAdapter,
  type TelegramAdapterConfig,
  type TelegramMessage,
  type TelegramUpdate,
} from '@chat-adapter/telegram';

type WebhookOptions = Parameters<TelegramAdapter['handleWebhook']>[1];

type TopicAwareMessage = TelegramMessage & { is_topic_message?: boolean };

const MESSAGE_FIELDS = [
  'message',
  'edited_message',
  'channel_post',
  'edited_channel_post',
] as const;

export class FrogBotTelegramAdapter extends TelegramAdapter {
  protected override processUpdate(update: TelegramUpdate, options?: WebhookOptions): void {
    super.processUpdate(routableUpdate(update), options);
  }

  override parseMessage(raw: TelegramMessage) {
    return super.parseMessage(routableMessage(raw));
  }
}

export function createFrogBotTelegramAdapter(
  config: TelegramAdapterConfig,
): FrogBotTelegramAdapter {
  return new FrogBotTelegramAdapter(config);
}

export function routableUpdate(update: TelegramUpdate): TelegramUpdate {
  const routed: TelegramUpdate = { ...update };

  MESSAGE_FIELDS.forEach((field) => {
    const message = update[field];

    if (message) routed[field] = routableMessage(message);
  });

  if (update.callback_query?.message) {
    routed.callback_query = {
      ...update.callback_query,
      message: routableMessage(update.callback_query.message),
    };
  }

  return routed;
}

export function routableMessage<T extends TelegramMessage>(message: T): T {
  const { is_topic_message: topic } = message as T & TopicAwareMessage;

  if (message.message_thread_id === undefined || topic === true) return message;

  const { message_thread_id: _anchor, ...routed } = message;

  return routed as T;
}
