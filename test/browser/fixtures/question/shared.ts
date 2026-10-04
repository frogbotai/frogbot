export const chatsSlug = 'chats';
export const messagesSlug = 'messages';
export const usersSlug = 'users';
export const tasksSlug = 'tasks';
export const reportsPath = '/reports';
export const insightsPath = '/insights';
export const robotSettings = { label: 'Robot', path: 'robot' };
export const agentSlug = 'questioner';
export const pickerAgentSlug = 'picker';
export const modelPort = Number(process.env.FROGBOT_TEST_PORT_OFFSET ?? 0) + 3129;
export const chatPicksPreference = 'frogbot-chat-picks';
export const turnsSlug = 'frogbot-chat-turns';
export const sliderPath = '/slider';
export const sliderFrameWidth = 288;

export const usageLogsSlug = 'usage-logs';
export const apiKeysSlug = 'api-keys';
export const costsPath = '/browser/costs';
export const costKeyName = 'Browser cost key';
export const costLogs = {
  small: {
    requestId: 'browser-cost-small',
    model: 'browser/cost-small',
    costUSD: 0.00017270000000000002,
  },
  key: { requestId: 'browser-cost-key', model: 'browser/cost-key', costUSD: 0.016455 },
};
export const monthlySpendUSD = 3.25;

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
