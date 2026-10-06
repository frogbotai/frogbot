import { createMicrosoftTeams } from '@frogbotai/piece-microsoft-teams';
import { expectTypeOf } from 'vitest';

const teams = createMicrosoftTeams({ auth: { accessToken: 'token' } });

const _found = teams.findTeamMember({ input: { teamId: 'team', searchValue: 'ada@example.com' } });

expectTypeOf<Parameters<typeof teams.findTeamMember>[0]['input']>().toEqualTypeOf<{
  teamId: string;
  searchBy?: 'email' | 'name' | undefined;
  searchValue: string;
}>();
expectTypeOf<Awaited<typeof _found>['found']>().toEqualTypeOf<boolean>();

const _findTeamMemberRejectsSendChatMessageInput = () =>
  // @ts-expect-error findTeamMember does not accept sendChatMessage input
  teams.findTeamMember({ input: { chatId: 'chat', content: 'Hello' } });

expectTypeOf<keyof typeof teams.triggers>().toEqualTypeOf<
  | 'channelMessageCreated'
  | 'channelCreated'
  | 'chatCreated'
  | 'chatMessageCreated'
  | 'messageReceived'
  | 'messageReactionReceived'
  | 'cardActionReceived'
  | 'conversationUpdated'
  | 'installationUpdated'
  | 'dialogOpened'
  | 'dialogSubmitted'
>();
expectTypeOf(teams.triggers.channelCreated.type).toEqualTypeOf<'polling'>();
expectTypeOf(teams.triggers.messageReceived.type).toEqualTypeOf<'app'>();
