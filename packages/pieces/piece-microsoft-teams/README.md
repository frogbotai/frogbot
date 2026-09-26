# `@frogbotai/piece-microsoft-teams`

Native Microsoft Graph actions, polling triggers, and Azure Bot channel support for Teams.

## Usage

```ts
import { defineMicrosoftTeams } from '@frogbotai/piece-microsoft-teams';

const createMicrosoftTeams = defineMicrosoftTeams({
  cloud: 'usGovernment',
  tenantId: process.env.MICROSOFT_TENANT_ID!,
});

export const microsoftTeams = createMicrosoftTeams({
  auth: {
    appId: process.env.TEAMS_BOT_APP_ID!,
    appPassword: process.env.TEAMS_BOT_APP_PASSWORD!,
  },
  oauth: {
    clientId: process.env.MICROSOFT_GRAPH_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_GRAPH_CLIENT_SECRET!,
  },
});
```

`defineMicrosoftTeams()` defaults to the commercial Microsoft cloud and the `common` tenant. Select the cloud and tenant when defining the factory so the OAuth authorization URL, token URL, stored credential, account lookup, and all Graph requests use one environment. `createMicrosoftTeams` is the pre-defined commercial `common` factory.

Azure Bot credentials and user Graph OAuth are independent. The factory `auth` config runs the channel adapter. A user's OAuth connection supplies the delegated Graph access token for actions; bot credentials never authorize Graph actions.

## Teams channel setup

1. Create an Azure Bot and its Microsoft Entra application. Record the application ID and client secret as `appId` and `appPassword`.
2. Enable the Microsoft Teams channel on the Azure Bot.
3. Set the bot messaging endpoint to `/api/webhooks/<piece-instance-slug>` on the public FrogBot URL. The instance is bound to one agent at boot and must have a globally unique slug.
4. Create or upload a Teams app manifest whose bot ID is the same Azure Bot application ID. Add personal, team, and group chat scopes as needed, then install the app.
5. Use `botAppType: 'SingleTenant'` with `botTenantId` for a single-tenant registration. Multi-tenant is the default.

Bot Framework Activities are authenticated by the official Teams adapter. FrogBot does not parse or accept an Activity before that adapter validates its bearer JWT. Live incoming authors may include an email resolved through the conversation-members API; FrogBot matches that normalized email to a local user. A missing email produces an anonymous channel participant and leaves access to the agent's channel access rule.

The separate Graph OAuth app registration uses the scopes below for user actions. It may be the same Entra application only when its bot credential, redirect URI, delegated permissions, and operational ownership are intentionally managed together; the two credentials remain separate in FrogBot configuration.

## Agent questions

When an agent with the `question` tool runs in Teams, each question call appears as one Adaptive Card with the choices, an optional text box, and **Submit** and **Dismiss** buttons. The card is replaced in place with the answer and who gave it, and the agent continues in the same conversation. The person who submits is matched to a FrogBot user by the email from the conversation's member list and must pass the agent's `access` check; others get a private notice. No Microsoft Graph permission is required. See the Microsoft Teams page in the FrogBot docs for the manifest, limits, and troubleshooting.

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

| Upstream trigger slug  | Native trigger            | Type      | Notes                                           |
| ---------------------- | ------------------------- | --------- | ----------------------------------------------- |
| `new-channel-message`  | `channelMessageCreated`   | `polling` | Uses the Graph delta link as its cursor         |
| `new-channel`          | `channelCreated`          | `polling` | Uses creation time as its cursor                |
| `new-chat`             | `chatCreated`             | `polling` | Uses creation time as its cursor                |
| `new-chat-message`     | `chatMessageCreated`      | `polling` | Uses the Graph delta link as its cursor         |
| Bot Framework message  | `messageReceived`         | `app`     | Secure shared bot ingress                       |
| Bot Framework reaction | `messageReactionReceived` | `app`     | Added and removed reactions                     |
| Adaptive Card action   | `cardActionReceived`      | `app`     | `Action.Submit` and adaptive-card invokes       |
| Conversation update    | `conversationUpdated`     | `app`     | Membership and bot-install conversation updates |
| Installation update    | `installationUpdated`     | `app`     | Teams app installation changes                  |
| Dialog open            | `dialogOpened`            | `app`     | Task module open invokes                        |
| Dialog submit          | `dialogSubmitted`         | `app`     | Task module submissions                         |

Polling runs every five minutes. Microsoft Graph does not offer delegated webhooks for this preserved piece contract, so events can arrive after the corresponding Teams activity; delta cursors prevent replay after a successful poll.
