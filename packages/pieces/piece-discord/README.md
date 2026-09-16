# `@frogbotai/piece-discord`

Send Discord messages, manage communities, and connect FrogBot agents through interactions and the Gateway.

## Usage

```ts
import { createDiscord } from '@frogbotai/piece-discord';

export const discord = createDiscord({
  auth: { botToken: process.env.DISCORD_BOT_TOKEN! },
  applicationId: process.env.DISCORD_APPLICATION_ID!,
  publicKey: process.env.DISCORD_PUBLIC_KEY!,
});
```

## Channel setup

1. Create an application and bot in the Discord Developer Portal. Copy the bot token, Application ID, and Public Key into the factory configuration above.
2. On the Bot page, enable the privileged **Message Content Intent**. FrogBot also uses Guilds, Guild Messages, Direct Messages, Guild Message Reactions, and Direct Message Reactions.
3. Set the Interactions Endpoint URL to `https://<host>/api/webhooks/<piece-instance-slug>`.
4. Invite the bot with the `bot` and `applications.commands` scopes. Grant View Channels, Send Messages, Send Messages in Threads, Read Message History, Add Reactions, and Attach Files as needed by the agent.
5. Run FrogBot's shared channel Gateway listener with `frogbot channels:run`, or keep the normal resident FrogBot process running. Discord messages, mentions, DMs, and reactions are delivered through this listener and are never polled.

Set FrogBot's `serverURL` to the absolute public URL of your deployment so the Gateway listener can forward events to the webhook endpoint.

Use `mentionRoleIds` for role mentions, `respondToChannelIds` for channels where every non-bot message should reach the agent, and `respondToGlobalMentions` for `@everyone` and `@here`. Discord accounts do not expose email addresses, so channel identity is anonymous unless agent access permits anonymous users.

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

| Upstream trigger slug | Native trigger   | Type  | Notes                                                          |
| --------------------- | ---------------- | ----- | -------------------------------------------------------------- |
| `new_message`         | `messageCreated` | `app` | Replaced by real-time Gateway delivery; polling is not ported. |
| `new_member`          | Dropped          |       | The official adapter's Gateway intents do not deliver members. |

Additional native events are `commandReceived`, `componentReceived`, `reactionAdded`, and `reactionRemoved`. HTTP interactions are verified by the official adapter with Discord's Ed25519 signature. Gateway deliveries are authenticated by the official adapter with the bot token and use the same instance ingress URL.

Reaction triggers suppress repeated additions or removals of the same emoji by the same user on the same message for 24 hours. If a user adds, removes, then re-adds a reaction during that window, the second addition does not run the trigger.
