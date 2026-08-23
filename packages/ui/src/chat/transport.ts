import type { FrogBotSDK } from '@frogbotai/sdk';
import {
  DefaultChatTransport,
  type HttpChatTransportInitOptions,
  type PrepareSendMessagesRequest,
  type UIMessage,
} from 'ai';

import { emitChatMutation } from './use-chats';

export type FrogbotChatTransportOptions<UI_MESSAGE extends UIMessage> = Omit<
  HttpChatTransportInitOptions<UI_MESSAGE>,
  'api' | 'fetch'
> & {
  agentSlug: string;
  sdk: FrogBotSDK;
  onChatId?: (chatId: string) => void;
};

export function prepareChatRequest<UI_MESSAGE extends UIMessage>(
  chatId?: string | number,
): PrepareSendMessagesRequest<UI_MESSAGE> {
  return ({ messages }) => {
    const unsafe = messages.some((message) =>
      message.parts.some(
        (part) => part.type === 'file' && (part.url.startsWith('data:') || part.providerReference),
      ),
    );
    if (unsafe) throw new Error('Chat attachments require a stable FrogBot file reference');
    return { body: { messages, ...(chatId === undefined ? {} : { chatId }) } };
  };
}

export class FrogbotChatTransport<
  UI_MESSAGE extends UIMessage = UIMessage,
> extends DefaultChatTransport<UI_MESSAGE> {
  chatId?: string;

  constructor({ agentSlug, sdk, onChatId, ...options }: FrogbotChatTransportOptions<UI_MESSAGE>) {
    const capture = { chatId: (_chatId: string) => undefined };
    const configuredHeaders = options.headers;
    super({
      ...options,
      api: `${sdk.baseURL}/agents/${encodeURIComponent(agentSlug)}`,
      headers: async () => {
        const headers = await (typeof configuredHeaders === 'function'
          ? configuredHeaders()
          : configuredHeaders);
        const merged = new Headers({ Accept: 'text/event-stream' });
        new Headers(headers).forEach((value, key) => merged.set(key, value));
        return merged;
      },
      fetch: async (input, init) => {
        const response = await sdk.fetch(input, init);
        const chatId = response.headers.get('X-Frogbot-Chat-Id');
        if (chatId) {
          capture.chatId(chatId);
          emitChatMutation();
        }
        if (response.status === 499) {
          return new Response(new ReadableStream({ start: (controller) => controller.close() }), {
            status: 200,
          });
        }
        return response;
      },
    });
    capture.chatId = (chatId) => {
      this.chatId = chatId;
      onChatId?.(chatId);
    };
  }

  override reconnectToStream(): Promise<null> {
    return Promise.resolve(null);
  }
}
