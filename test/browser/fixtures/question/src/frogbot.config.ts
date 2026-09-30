import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { type AgentModelId, buildConfig, definePiece } from 'frogbot';
import { question } from 'frogbot/tools';

import {
  agentSlug,
  channelChat,
  channelQuestion,
  chatPicksPreference,
  chatsSlug,
  insightsPath,
  messagesSlug,
  modelPort,
  reportsPath,
  robotSettings,
  tasksSlug,
  turnsSlug,
  usersSlug,
} from '../shared';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET || 'browser-question-secret',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:./frogbot.db' } }),
  typescript: { autoGenerate: false },
  admin: {
    importMap: { autoGenerate: false },
    components: {
      navItems: [
        { label: 'New Chat', path: `/collections/${chatsSlug}/create`, icon: 'pencil-edit' },
        { label: 'Reports', path: reportsPath, icon: 'home' },
        { label: 'Insights', path: insightsPath, icon: 'home' },
      ],
      navSections: ['@frogbotai/next#CollectionsSection', '@frogbotai/next#RecentsSection'],
      views: {
        insights: { Component: '/components/InsightsView#InsightsView', path: insightsPath },
        reports: { Component: '/components/ReportsView#ReportsView', path: reportsPath },
      },
    },
  },
  collections: [
    { slug: usersSlug, auth: true, fields: [] },
    { slug: messagesSlug, message: true, admin: { hidden: false }, fields: [] },
    {
      slug: tasksSlug,
      admin: {
        useAsTitle: 'title',
        views: [{ type: 'list' }, { type: 'board', groupBy: 'status' }],
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        {
          name: 'status',
          type: 'select',
          options: [
            { label: 'Backlog', value: 'backlog' },
            { label: 'Done', value: 'done' },
          ],
        },
      ],
    },
  ],
  settings: [{ ...robotSettings, Component: '/components/RobotSettings#RobotSettings' }],
  pieces: [
    definePiece({ slug: 'slack', label: 'Slack', actions: [] })({
      slug: channelChat.channelThread.account,
    }),
  ],
  ai: {
    providers: {
      browser: {
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        apiKey: 'browser-provider-key',
        models: [
          { id: 'questioner', mode: 'chat' },
          {
            id: 'thinker',
            mode: 'chat',
            reasoningOptions: [{ type: 'effort', values: ['low', 'high'] }],
          },
        ],
      },
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: { default: 'browser/questioner' as AgentModelId, options: '*' },
      instructions: 'Ask before acting.',
      access: ({ req }) => Boolean(req.user),
      tools: [question],
    },
  ],
  endpoints: [
    {
      path: '/browser/reset',
      method: 'post',
      handler: async (req) => {
        if (!req.user) return new Response(null, { status: 401 });

        for (const collection of [messagesSlug, chatsSlug, turnsSlug, tasksSlug]) {
          await req.frogbot.delete({ collection, where: {}, overrideAccess: true, req });
        }

        await req.frogbot.delete({
          collection: 'payload-preferences',
          where: { key: { equals: chatPicksPreference } },
          overrideAccess: true,
          req,
        });

        return Response.json({ reset: true });
      },
    },
    {
      path: '/browser/channel-chat',
      method: 'post',
      handler: async (req) => {
        if (!req.user) return new Response(null, { status: 401 });

        const chat = await req.frogbot.create({
          collection: chatsSlug,
          data: { ...channelChat, user: req.user.id, agent: agentSlug },
          overrideAccess: true,
          req,
        });

        const messages = [
          { id: 'channel-user-1', role: 'user', parts: [{ type: 'text', text: 'Deploy it' }] },
          {
            id: 'channel-assistant-1',
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              {
                type: 'tool-question',
                toolCallId: 'channel-call-1',
                state: 'input-available',
                input: { questions: [channelQuestion] },
              },
            ],
          },
        ];

        for (const message of messages) {
          await req.frogbot.create({
            collection: messagesSlug,
            data: { ...message, chat: chat.id },
            overrideAccess: true,
            req,
          });
        }

        await req.frogbot.create({
          collection: turnsSlug,
          data: { id: String(chat.id), state: 'awaiting' },
          overrideAccess: true,
          req,
        });

        return Response.json({ chatId: chat.id });
      },
    },
  ],
});
