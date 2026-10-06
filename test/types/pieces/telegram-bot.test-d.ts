import { createTelegramBot } from '@frogbotai/piece-telegram-bot';
import { expectTypeOf } from 'vitest';

const telegram = createTelegramBot({ auth: { botToken: 'token' } });

const _answered = telegram.answerCallbackQuery({
  input: { callbackQueryId: 'query', text: 'Done', showAlert: true },
});

expectTypeOf<Parameters<typeof telegram.answerCallbackQuery>[0]['input']>().toEqualTypeOf<{
  callbackQueryId: string;
  text?: string | undefined;
  showAlert?: boolean | undefined;
  url?: string | undefined;
  cacheTime?: number | undefined;
}>();
expectTypeOf<Awaited<typeof _answered>['ok']>().toEqualTypeOf<true>();

const _answerCallbackQueryRejectsSendTextMessageInput = () =>
  // @ts-expect-error answerCallbackQuery does not accept sendTextMessage input
  telegram.answerCallbackQuery({ input: { chatId: 1, message: 'Hello' } });

const _file = telegram.getFile({ input: { fileId: 'file' } });

expectTypeOf<Awaited<typeof _file>['fileInfo']['file_id']>().toEqualTypeOf<string>();
expectTypeOf<Awaited<typeof _file>['fileUrl']>().toEqualTypeOf<string | undefined>();

expectTypeOf<keyof typeof telegram.triggers>().toEqualTypeOf<'newUpdate'>();
expectTypeOf(telegram.triggers.newUpdate.type).toEqualTypeOf<'app'>();
