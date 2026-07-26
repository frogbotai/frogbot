import * as module from '@activepieces/piece-telegram-bot';
import { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";

export const telegramBotActions = ['send_text_message', 'send_media', 'send_document', 'send_location', 'edit_message_text', 'get_chat'] as const;
export const telegramBotScopes = [] as const;

export function createTelegramBot(config?: PieceFactoryConfig) {
  const piece = createActivepiecesPiece({
    module: module,
    service: "telegram_bot",
    credentialType: "secret_text",
    defaultActions: telegramBotActions,
    scopes: telegramBotScopes,
    config,
  });
  return Object.assign(piece, {
    /** Send Text Message: Send a text message through a Telegram bot */
    sendTextMessage: piece.tool("send_text_message"),
    /** Send Media: Send a media message (photo, video, sticker, GIF) through a Telegram bot */
    sendMedia: piece.tool("send_media"),
    /** Send Document: Send a generic file (document) to a Telegram chat */
    sendDocument: piece.tool("send_document"),
    /** Send Audio: Send an audio file to a Telegram chat (.MP3/.M4A — shown in the music player) */
    sendAudio: piece.tool("send_audio"),
    /** Send Location: Send a geographic location (latitude/longitude) to a Telegram chat */
    sendLocation: piece.tool("send_location"),
    /** Send Media Group: Send a group of 2–10 photos, videos, documents or audios as an album to a chat */
    sendMediaGroup: piece.tool("send_media_group"),
    /** Send Poll: Send a native Telegram poll (regular or quiz) to a chat */
    sendPoll: piece.tool("send_poll"),
    /** Send Chat Action: Show a status (typing, uploading photo, recording voice, etc.) on behalf of the bot in a chat. The status is shown for up to 5 seconds. */
    sendChatAction: piece.tool("send_chat_action"),
    /** Edit Message Text: Edit the text of a previously sent message or an inline message */
    editMessageText: piece.tool("edit_message_text"),
    /** Delete Message: Delete a message sent in a chat. Bots can delete their own messages and messages in groups where they are admins. */
    deleteMessage: piece.tool("delete_message"),
    /** Forward Message: Forward a message from one chat to another */
    forwardMessage: piece.tool("forward_message"),
    /** Pin Message: Pin a message in a chat. The bot must be an administrator in the chat for this to work. */
    pinMessage: piece.tool("pin_message"),
    /** Unpin Message: Unpin a message in a chat. Leave Message Id empty to unpin the most recent pinned message. */
    unpinMessage: piece.tool("unpin_message"),
    /** Get Chat: Get up-to-date information about a chat (name, description, photo, member count, etc.) */
    getChat: piece.tool("get_chat"),
    /** Get Chat Member: Get member info (or null) for the provided chat id and user id */
    getChatMember: piece.tool("get_chat_member"),
    /** Get File: Get file information and optionally download a file from Telegram */
    getFile: piece.tool("get_file"),
    /** Create Invite Link: Create an invite link for a chat */
    createInviteLink: piece.tool("create_invite_link"),
    /** Answer Callback Query: Respond to a callback query sent by an inline keyboard button. Shows a notification or alert to the user. */
    answerCallbackQuery: piece.tool("answer_callback_query"),
    /** Request Approval Message: Send an approval message to a chat and wait until the message is approved or disapproved */
    requestApprovalMessage: piece.tool("request_approval_message"),
    /** Custom API Call: Make a custom API call to a specific endpoint */
    customApiCall: piece.tool("custom_api_call"),
  });
}
