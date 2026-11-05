// src/agents/inboxAssistant.ts
import { createGmail } from '@frogbotai/piece-gmail';
import type { AgentConfig } from 'frogbot';

export const gmail = createGmail({
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
});

export const inboxAssistant: AgentConfig = {
  slug: 'inbox-assistant',
  instructions: 'Find emails and write replies. Send only what the user asks you to send.',
  tools: [gmail.searchEmails, { ...gmail.send, approval: 'ask' }],
};
