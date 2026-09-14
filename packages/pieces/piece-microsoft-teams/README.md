# `@frogbotai/piece-microsoft-teams`

Native Microsoft Graph actions and polling triggers for channels, chats, messages, and meetings.

## Usage

```ts
import { defineMicrosoftTeams } from '@frogbotai/piece-microsoft-teams';

const createMicrosoftTeams = defineMicrosoftTeams({
  cloud: 'usGovernment',
  tenantId: process.env.MICROSOFT_TENANT_ID!,
});

export const microsoftTeams = createMicrosoftTeams({
  oauth: {
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  },
});
```

`defineMicrosoftTeams()` defaults to the commercial Microsoft cloud and the `common` tenant. Select the cloud and tenant when defining the factory so the OAuth authorization URL, token URL, stored credential, account lookup, and all Graph requests use one environment. `createMicrosoftTeams` is the pre-defined commercial `common` factory.

## Actions

| Upstream action slug                           | Previous wrapper export                  | Native action              | Notes                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `microsoft_teams_create_channel`               | `microsoftTeamsCreateChannel`            | `createChannel`            | Standard channel                                                                                                                             |
| `microsoft_teams_send_channel_message`         | `microsoftTeamsSendChannelMessage`       | `sendChannelMessage`       | Text or HTML                                                                                                                                 |
| `microsoft_teams_send_chat_message`            | `microsoftTeamsSendChatMessage`          | `sendChatMessage`          | Text or HTML                                                                                                                                 |
| `microsoft_teams_reply_to_channel_message`     | `microsoftTeamsReplyToChannelMessage`    | `replyToChannelMessage`    | Thread reply                                                                                                                                 |
| `microsoft_teams_create_chat_and_send_message` | `microsoftTeamsCreateChatAndSendMessage` | `createChatAndSendMessage` | One-to-one or group chat                                                                                                                     |
| `microsoft_teams_create_private_channel`       | `microsoftTeamsCreatePrivateChannel`     | `createPrivateChannel`     | Private channel                                                                                                                              |
| `microsoft_teams_get_chat_message`             | `microsoftTeamsGetChatMessage`           | `getChatMessage`           |                                                                                                                                              |
| `microsoft_teams_delete_chat_message`          | `microsoftTeamsDeleteChatMessage`        | `deleteChatMessage`        | Soft delete                                                                                                                                  |
| `microsoft_teams_get_channel_message`          | `microsoftTeamsGetChannelMessage`        | `getChannelMessage`        | Supports replies                                                                                                                             |
| `microsoft_teams_find_channel`                 | `microsoftTeamsFindChannel`              | `findChannel`              | Exact display-name match                                                                                                                     |
| `microsoft_teams_find_team_member`             | `microsoftTeamsFindTeamMember`           | `findTeamMember`           | Exact email or display-name match                                                                                                            |
| `microsoft_teams_get_meeting_transcript`       | `microsoftTeamsGetMeetingTranscript`     | `getMeetingTranscript`     | Lists metadata or returns VTT text; no file is created because the upstream output is text                                                   |
| `microsoft_teams_get_meeting_recording`        | `microsoftTeamsGetMeetingRecording`      | `getMeetingRecording`      | Lists or returns metadata; upstream does not download recording bytes                                                                        |
| `request_approval_in_channel`                  | `requestApprovalInChannel`               | Omitted                    | Activepieces-specific waitpoint action calls `run.pause` and resumes from an approval URL; durable waits belong to the FrogBot workflow host |
| `request_approval_direct_message`              | `requestApprovalDirectMessage`           | Omitted                    | Activepieces-specific waitpoint action calls `run.pause` and resumes from an approval URL; durable waits belong to the FrogBot workflow host |
| `custom_api_call`                              | `customApiCall`                          | `customApiCall`            | Authenticated JSON requests restricted to the configured Microsoft Graph v1.0 origin; redirects and cross-origin URLs are rejected           |

## Triggers

| Upstream trigger slug | Native trigger          | Type      | Notes                                   |
| --------------------- | ----------------------- | --------- | --------------------------------------- |
| `new-channel-message` | `channelMessageCreated` | `polling` | Uses the Graph delta link as its cursor |
| `new-channel`         | `channelCreated`        | `polling` | Uses creation time as its cursor        |
| `new-chat`            | `chatCreated`           | `polling` | Uses creation time as its cursor        |
| `new-chat-message`    | `chatMessageCreated`    | `polling` | Uses the Graph delta link as its cursor |

Polling runs every five minutes. Microsoft Graph does not offer delegated webhooks for this preserved piece contract, so events can arrive after the corresponding Teams activity; delta cursors prevent replay after a successful poll.
