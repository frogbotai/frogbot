# `@frogbotai/piece-slack`

Native Slack messaging, file, workspace administration, and app-event capabilities for FrogBot.

## Usage

```ts
import { createSlack } from '@frogbotai/piece-slack';

export const slack = createSlack({
  oauth: {
    clientId: process.env.SLACK_CLIENT_ID!,
    clientSecret: process.env.SLACK_CLIENT_SECRET!,
  },
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});
```

Static credentials use `{ botToken, userToken?, teamId? }`. OAuth uses Slack OAuth v2 and stores the bot token, workspace ID, and optional authed-user token returned by Slack.

To attach the app to an agent, use the static bot token and add the piece instance to `channels`:

```ts
import { createSlack } from '@frogbotai/piece-slack';
import { buildConfig } from 'frogbot';

export const slack = createSlack({
  auth: { botToken: process.env.SLACK_BOT_TOKEN! },
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

export default buildConfig({
  agents: [
    {
      slug: 'support',
      channels: [slack],
      access: ({ req }) => !!req.user || req.context.channel?.piece === 'slack',
    },
  ],
  pieces: [slack],
});
```

## Actions

| Upstream action slug              | Previous wrapper export        | Native action            | Notes                                                                                |
| --------------------------------- | ------------------------------ | ------------------------ | ------------------------------------------------------------------------------------ |
| `slack-add-reaction-to-message`   | `slackAddReactionToMessage`    | `addReaction`            |                                                                                      |
| `send_direct_message`             | `sendDirectMessage`            | `sendDirectMessage`      |                                                                                      |
| `send_channel_message`            | `sendChannelMessage`           | `sendChannelMessage`     |                                                                                      |
| `request_approval_direct_message` | `requestApprovalDirectMessage` | Omitted                  | Workflow waitpoint approval action.                                                  |
| `request_approval_message`        | `requestApprovalMessage`       | Omitted                  | Workflow waitpoint approval action.                                                  |
| `request_action_direct_message`   | `requestActionDirectMessage`   | Omitted                  | Workflow waitpoint action selection.                                                 |
| `request_action_message`          | `requestActionMessage`         | Omitted                  | Workflow waitpoint action selection.                                                 |
| `uploadFile`                      | `uploadFile`                   | `uploadFile`             | Uses Slack's external upload flow.                                                   |
| `get-file`                        | `getFile`                      | `getFile`                | Safely persists downloaded bytes in the FrogBot files collection.                    |
| `searchMessages`                  | `searchMessages`               | `searchMessages`         | Requires a user token.                                                               |
| `slack-find-user-by-email`        | `slackFindUserByEmail`         | `findUserByEmail`        |                                                                                      |
| `slack-find-user-by-handle`       | `slackFindUserByHandle`        | `findUserByHandle`       |                                                                                      |
| `find-user-by-id`                 | `findUserById`                 | `findUserById`           |                                                                                      |
| `listUsers`                       | `listUsers`                    | `listUsers`              |                                                                                      |
| `updateMessage`                   | `updateMessage`                | `updateMessage`          |                                                                                      |
| `delete-message`                  | `deleteMessage`                | `deleteMessage`          | Requires a user token.                                                               |
| `slack-create-channel`            | `slackCreateChannel`           | `createChannel`          |                                                                                      |
| `slack-update-profile`            | `slackUpdateProfile`           | `updateProfile`          | Requires a user token.                                                               |
| `getChannelHistory`               | `getChannelHistory`            | `getChannelHistory`      |                                                                                      |
| `slack-set-user-status`           | `slackSetUserStatus`           | `setUserStatus`          | Requires a user token.                                                               |
| `markdownToSlackFormat`           | `markdownToSlackFormat`        | `markdownToSlack`        | Local conversion.                                                                    |
| `retrieveThreadMessages`          | `retrieveThreadMessages`       | `listThreadMessages`     |                                                                                      |
| `set-channel-topic`               | `setChannelTopic`              | `setChannelTopic`        |                                                                                      |
| `get-message`                     | `getMessage`                   | `getMessage`             |                                                                                      |
| `invite-user-to-channel`          | `inviteUserToChannel`          | `inviteUserToChannel`    |                                                                                      |
| `get_group_by_handle`             | `getGroupByHandle`             | `getUserGroupByHandle`   |                                                                                      |
| `update_group_users`              | `updateGroupUsers`             | `updateUserGroupMembers` | User-token update.                                                                   |
| `custom_api_call`                 | `customApiCall`                | `customApiCall`          | Relative Slack Web API methods only; redirects and caller auth headers are rejected. |

## Triggers

Trigger filters use manual Slack IDs: channel IDs such as `C0123`, user IDs such as `U0123`, user group IDs such as `S0123`, and emoji names without colons. Empty filter arrays match every accessible value.

| Upstream trigger slug           | Native trigger          | Type  | Slack subscription                   |
| ------------------------------- | ----------------------- | ----- | ------------------------------------ |
| `new-message`                   | `messageCreated`        | `app` | `message.channels`, `message.groups` |
| `new-message-in-channel`        | `channelMessageCreated` | `app` | `message.channels`, `message.groups` |
| `new-direct-message`            | `directMessageCreated`  | `app` | `message.im`                         |
| `new_mention`                   | `channelMentionCreated` | `app` | `message.channels`, `message.groups` |
| `new-mention-in-direct-message` | `directMentionCreated`  | `app` | `message.im`                         |
| `new_reaction_added`            | `reactionAdded`         | `app` | `reaction_added`                     |
| `new_reaction_removed`          | `reactionRemoved`       | `app` | `reaction_removed`                   |
| `channel_created`               | `channelCreated`        | `app` | `channel_created`                    |
| `new_command`                   | `channelCommandCreated` | `app` | `message.channels`, `message.groups` |
| `new-command-in-direct-message` | `directCommandCreated`  | `app` | `message.im`                         |
| `new-user`                      | `userJoined`            | `app` | `team_join`                          |
| `new-saved-message`             | `messageSaved`          | `app` | `star_added`                         |
| `new-team-custom-emoji`         | `customEmojiAdded`      | `app` | `emoji_changed`                      |
| `new-modal-interaction`         | `modalInteraction`      | `app` | Interactivity request URL            |

## Slack App Setup

1. Copy `slack-manifest.yaml`, replace `{{FROGBOT_URL}}` with the public origin and `{{SLACK_INSTANCE_SLUG}}` with the piece instance slug, then create the Slack app from the manifest.
2. Install the app and set `SLACK_BOT_TOKEN` to its Bot User OAuth Token and `SLACK_SIGNING_SECRET` to the app's signing secret.
3. Add the piece instance to one agent's `channels`. The Events URL is `{{FROGBOT_URL}}/api/webhooks/{{SLACK_INSTANCE_SLUG}}`; FrogBot verifies requests and answers Slack's URL challenge through the channel adapter.
4. Reinstall the app after changing scopes or subscriptions, and invite the bot to private channels it must access.

The manifest grants `users:read` and `users:read.email`. For each message, FrogBot calls `users.info` with the bot token and matches the returned profile email to the configured FrogBot user collection. No match or no email produces an anonymous channel participant; the agent's `access` function decides whether that participant may run the agent.

The existing OAuth setup remains available for actions and app-event triggers. Add corresponding user scopes for actions marked as requiring a user token.

## Limitations

- The Chat SDK may suppress redelivery after a failed channel-job enqueue, leaving the message unprocessed. Channel ingress is not durable and does not guarantee exactly-once delivery.
- The four approval/action actions are deliberately omitted because durable waits belong to FrogBot workflows.
- Slack app webhooks are configured once on the Slack app; individual trigger instances only filter routed deliveries.
- Message search, profile/status changes, message deletion, and user-group membership updates need an OAuth user token and the applicable user scopes.
