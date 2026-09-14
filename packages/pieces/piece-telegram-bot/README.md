# `@frogbotai/piece-telegram-bot`

Send Telegram Bot API requests and receive bot updates through FrogBot.

## Usage

```ts
import { createTelegramBot } from '@frogbotai/piece-telegram-bot';

export const telegramBot = createTelegramBot({
  auth: { botToken: process.env.TELEGRAM_BOT_TOKEN! },
});
```

## Actions

| Upstream action slug       | Previous wrapper export  | Native action            | Notes                                                                           |
| -------------------------- | ------------------------ | ------------------------ | ------------------------------------------------------------------------------- |
| `send_text_message`        | `sendTextMessage`        | `sendTextMessage`        |                                                                                 |
| `send_media`               | `sendMedia`              | `sendMedia`              | Accepts a Telegram file ID or URL.                                              |
| `send_document`            | `sendDocument`           | `sendDocument`           | Accepts a Telegram file ID or URL.                                              |
| `send_audio`               | `sendAudio`              | `sendAudio`              | Accepts a Telegram file ID or URL.                                              |
| `send_location`            | `sendLocation`           | `sendLocation`           |                                                                                 |
| `send_media_group`         | `sendMediaGroup`         | `sendMediaGroup`         | Accepts Telegram file IDs or URLs.                                              |
| `send_poll`                | `sendPoll`               | `sendPoll`               |                                                                                 |
| `send_chat_action`         | `sendChatAction`         | `sendChatAction`         |                                                                                 |
| `edit_message_text`        | `editMessageText`        | `editMessageText`        |                                                                                 |
| `delete_message`           | `deleteMessage`          | `deleteMessage`          |                                                                                 |
| `forward_message`          | `forwardMessage`         | `forwardMessage`         |                                                                                 |
| `pin_message`              | `pinMessage`             | `pinMessage`             |                                                                                 |
| `unpin_message`            | `unpinMessage`           | `unpinMessage`           |                                                                                 |
| `get_chat`                 | `getChat`                | `getChat`                |                                                                                 |
| `get_chat_member`          | `getChatMember`          | `getChatMember`          |                                                                                 |
| `get_file`                 | `getFile`                | `getFile`                | Returns Telegram file metadata.                                                 |
| `create_invite_link`       | `createInviteLink`       | `createInviteLink`       |                                                                                 |
| `answer_callback_query`    | `answerCallbackQuery`    | `answerCallbackQuery`    |                                                                                 |
| `request_approval_message` | `requestApprovalMessage` | `requestApprovalMessage` | Takes a workflow-owned `resumeUrl`; durable waiting remains a workflow concern. |
| `custom_api_call`          | `customApiCall`          | `customApiCall`          |                                                                                 |

## Triggers

| Upstream trigger slug  | Native trigger | Type      | Notes                                                                        |
| ---------------------- | -------------- | --------- | ---------------------------------------------------------------------------- |
| `new_telegram_message` | `newUpdate`    | `webhook` | Registers selected update types; Telegram permits one webhook per bot token. |
