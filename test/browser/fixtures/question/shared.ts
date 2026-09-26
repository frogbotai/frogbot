export const chatsSlug = 'chats';
export const messagesSlug = 'messages';
export const usersSlug = 'users';
export const agentSlug = 'questioner';
export const modelPort = 3128;
export const chatPicksPreference = 'frogbot-chat-picks';
export const turnsSlug = 'frogbot-chat-turns';

export const channelQuestion = {
  header: 'Target',
  question: 'Where should this deploy?',
  options: [{ label: 'Staging' }, { label: 'Production' }],
  custom: false,
};

export const channelChat = {
  title: 'Deploy thread',
  channel: 'slack',
  externalId: '1.000001',
  channelKey: 'slack:browser:1.000001',
  channelThread: {
    account: 'slack',
    thread: { _type: 'chat:Thread', id: 'slack:C1:1.000001', channelId: 'slack:C1' },
  },
};
