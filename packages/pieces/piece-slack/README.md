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

1. Create a Slack app and add the OAuth redirect URL shown by FrogBot.
2. Add the bot scopes required by the actions and event subscriptions you use. Add corresponding user scopes for actions marked as requiring a user token.
3. Set the FrogBot app-trigger URL as both the Event Subscriptions request URL and Interactivity request URL.
4. Subscribe to the bot events listed above. Slack sends a URL challenge when the event URL is configured; FrogBot answers it automatically.
5. Pass the app's signing secret to `createSlack({ signingSecret })`. Unsigned, stale, altered, or wrong-workspace deliveries are rejected; valid Slack retries remain acceptable for downstream deduplication.
6. Install or reinstall the app after changing scopes or subscriptions, and invite the bot to private channels it must access.

## Limitations

- The four approval/action actions are deliberately omitted because durable waits belong to FrogBot workflows.
- Slack app webhooks are configured once on the Slack app; individual trigger instances only filter routed deliveries.
- The piece does not expose a FrogBot channel adapter in this port.
- Message search, profile/status changes, message deletion, and user-group membership updates need an OAuth user token and the applicable user scopes.
