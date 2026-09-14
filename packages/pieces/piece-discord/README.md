# `@frogbotai/piece-discord`

Send Discord messages and manage guild channels, members, roles, and polling events.

## Usage

```ts
import { createDiscord } from '@frogbotai/piece-discord';

export const discord = createDiscord({
  auth: { botToken: process.env.DISCORD_BOT_TOKEN! },
});
```

## Actions

| Upstream action slug       | Previous wrapper export  | Native action          | Notes                                                                                       |
| -------------------------- | ------------------------ | ---------------------- | ------------------------------------------------------------------------------------------- |
| `sendMessageWithBot`       | `sendMessageWithBot`     | `sendMessage`          | Attachments use FrogBot file IDs.                                                           |
| `send_message_webhook`     | `sendMessageWebhook`     | `sendWebhookMessage`   | The webhook URL supplies its own authentication.                                            |
| `request_approval_message` | `requestApprovalMessage` | `requestApproval`      | Accepts a workflow-provided `reviewUrl`; durable waiting remains a workflow concern.        |
| `add_role_to_member`       | `addRoleToMember`        | `addRoleToMember`      |                                                                                             |
| `remove_role_from_member`  | `removeRoleFromMember`   | `removeRoleFromMember` |                                                                                             |
| `remove_member_from_guild` | `removeMemberFromGuild`  | `removeMember`         |                                                                                             |
| `list_guild_members`       | `listGuildMembers`       | `listMembers`          | Applies the supplied username search.                                                       |
| `rename_channel`           | `renameChannel`          | `renameChannel`        |                                                                                             |
| `create_channel`           | `createChannel`          | `createChannel`        |                                                                                             |
| `delete_channel`           | `deleteChannel`          | `deleteChannel`        |                                                                                             |
| `find_channel`             | `findChannel`            | `findChannel`          | Exact name match.                                                                           |
| `remove_ban_from_user`     | `removeBanFromUser`      | `unbanMember`          |                                                                                             |
| `createGuildRole`          | `createGuildRole`        | `createRole`           |                                                                                             |
| `deleteGuildRole`          | `deleteGuildRole`        | `deleteRole`           |                                                                                             |
| `ban_guild_member`         | `banGuildMember`         | `banMember`            |                                                                                             |
| `custom_api_call`          | `customApiCall`          | `sendApiRequest`       | Restricts requests to relative Discord API paths so the bot token cannot be sent elsewhere. |

## Triggers

| Upstream trigger slug | Native trigger   | Type      | Notes                                                                |
| --------------------- | ---------------- | --------- | -------------------------------------------------------------------- |
| `new_message`         | `messageCreated` | `polling` | Enter the channel ID manually; the cursor tracks message timestamps. |
| `new_member`          | `memberJoined`   | `polling` | Enter the guild ID manually; the cursor tracks join timestamps.      |
