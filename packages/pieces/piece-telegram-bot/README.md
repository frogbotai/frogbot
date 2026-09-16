# `@frogbotai/piece-telegram-bot`

Send Telegram Bot API requests and receive bot updates through FrogBot.

## Usage

```ts
import { createTelegramBot } from '@frogbotai/piece-telegram-bot';

export const telegramBot = createTelegramBot({
  auth: { botToken: process.env.TELEGRAM_BOT_TOKEN! },
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET!,
  botUsername: 'frogbot',
});
```

## Setup

1. Create a bot with [BotFather](https://t.me/BotFather) and copy its bot token.
2. Choose a webhook secret containing only letters, numbers, underscores, or hyphens. Keep it private.
3. Register `https://<your-host>/api/webhooks/<piece-instance-slug>` with Telegram's `setWebhook` method and pass the same value as `secret_token`.
4. Add `message`, `edited_message`, `channel_post`, `edited_channel_post`, and `callback_query` to `allowed_updates`. Add any other update types used by `newUpdate`.
5. Disable privacy mode with BotFather when the bot must receive ordinary group messages. Add the bot to each group or channel with the permissions needed to read and reply.
6. Mount the instance in the agent's `channels: [telegramBot]` and explicitly configure the agent's `access` callback to permit the intended anonymous participants.

Telegram does not use a webhook challenge handshake. FrogBot verifies every delivery with the `X-Telegram-Bot-Api-Secret-Token` header. Set `allowedUserIds` to restrict channel conversations to known Telegram user IDs; omitted or empty values allow every Telegram user to reach the bot, subject to your FrogBot agent access rules.

Allowlisting does not authenticate a FrogBot user. Telegram channel identity always returns `null`, so default agent access denies even allowlisted users. For an intentionally public agent, `access: () => true` permits anonymous use on every agent entry point. For restricted access, use a callback that checks the intended channel and participant through `req.context.channel`; keep `allowedUserIds` configured as the Telegram-side filter.

Telegram permits one webhook per bot token. The channel adapter and `newUpdate` share the instance webhook above; do not register a separate subscription URL. Direct messages, groups, and each forum topic remain separate conversations.

The Start button (`/start`) and other direct-message commands reach the agent with their command text and arguments intact. Group commands addressed to `@<botUsername>` use the same mention and conversation routing as ordinary messages.

## Actions

| Upstream action slug    | Previous wrapper export | Native action         | Notes                              |
| ----------------------- | ----------------------- | --------------------- | ---------------------------------- |
| `send_text_message`     | `sendTextMessage`       | `sendTextMessage`     |                                    |
| `send_media`            | `sendMedia`             | `sendMedia`           | Accepts a Telegram file ID or URL. |
| `send_document`         | `sendDocument`          | `sendDocument`        | Accepts a Telegram file ID or URL. |
| `send_audio`            | `sendAudio`             | `sendAudio`           | Accepts a Telegram file ID or URL. |
| `send_location`         | `sendLocation`          | `sendLocation`        |                                    |
| `send_media_group`      | `sendMediaGroup`        | `sendMediaGroup`      | Accepts Telegram file IDs or URLs. |
| `send_poll`             | `sendPoll`              | `sendPoll`            |                                    |
| `send_chat_action`      | `sendChatAction`        | `sendChatAction`      |                                    |
| `edit_message_text`     | `editMessageText`       | `editMessageText`     |                                    |
| `delete_message`        | `deleteMessage`         | `deleteMessage`       |                                    |
| `forward_message`       | `forwardMessage`        | `forwardMessage`      |                                    |
| `pin_message`           | `pinMessage`            | `pinMessage`          |                                    |
| `unpin_message`         | `unpinMessage`          | `unpinMessage`        |                                    |
| `get_chat`              | `getChat`               | `getChat`             |                                    |
| `get_chat_member`       | `getChatMember`         | `getChatMember`       |                                    |
| `get_file`              | `getFile`               | `getFile`             | Returns Telegram file metadata.    |
| `create_invite_link`    | `createInviteLink`      | `createInviteLink`    |                                    |
| `answer_callback_query` | `answerCallbackQuery`   | `answerCallbackQuery` |                                    |
| `custom_api_call`       | `customApiCall`         | `customApiCall`       |                                    |

## Triggers

| Upstream trigger slug  | Native trigger | Type  | Notes                                                        |
| ---------------------- | -------------- | ----- | ------------------------------------------------------------ |
| `new_telegram_message` | `newUpdate`    | `app` | Filters update types received by the shared channel webhook. |
