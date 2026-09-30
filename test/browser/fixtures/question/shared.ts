export const chatsSlug = 'chats';
export const messagesSlug = 'messages';
export const usersSlug = 'users';
export const tasksSlug = 'tasks';
export const reportsPath = '/reports';
export const insightsPath = '/insights';
export const robotSettings = { label: 'Robot', path: 'robot' };
export const agentSlug = 'questioner';
export const pickerAgentSlug = 'picker';
export const modelPort = 3128;
export const chatPicksPreference = 'frogbot-chat-picks';
export const turnsSlug = 'frogbot-chat-turns';
export const sliderPath = '/slider';
export const sliderFrameWidth = 288;

export const reasoningModels = {
  deliberator: 'deliberator',
  sprinter: 'sprinter',
  verbose: 'verbose',
};

export const deliberatorEfforts = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
export const deliberatorLevels = ['Default', 'Off', 'Low', 'Medium', 'High', 'Extra High', 'Max'];
export const verboseEffort = 'exhaustive-multi-pass-deliberation';
export const verboseLevel = 'Exhaustive-multi-pass-deliberation';

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
