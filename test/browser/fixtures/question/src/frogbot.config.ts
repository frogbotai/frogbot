import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { apiKeysPlugin, mintApiKey } from '@frogbotai/plugin-api-keys';
import {
  type AgentModelId,
  autonumberField,
  barcodeField,
  buildConfig,
  createdByField,
  definePiece,
  durationField,
  lastModifiedByField,
  percentField,
  phoneField,
  ratingField,
  urlField,
} from 'frogbot';
import { question } from 'frogbot/tools';

import {
  agentSlug,
  apiKeysSlug,
  channelChat,
  channelQuestion,
  chatPicksPreference,
  chatsSlug,
  costKeyName,
  costLogs,
  costsPath,
  deliberatorEfforts,
  hiddenSettings,
  insightsPath,
  labelOptions,
  messagesSlug,
  modelPort,
  monthlySpendUSD,
  pickerAgentSlug,
  reasoningModels,
  reportsPath,
  robotSettings,
  tasksSlug,
  timesheetsSlug,
  turnsSlug,
  usageLogsSlug,
  usersSlug,
  verboseEffort,
} from '../shared';

const slack = definePiece({ slug: 'slack', label: 'Slack', actions: [] })({
  slug: channelChat.channelThread.account,
});

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
    { slug: usersSlug, auth: true, admin: { useAsTitle: 'email' }, fields: [] },
    { slug: messagesSlug, message: true, admin: { hidden: false }, fields: [] },
    {
      slug: tasksSlug,
      admin: {
        useAsTitle: 'title',
        views: [
          { type: 'list', defaultFields: ['title', 'number', 'status', 'channel', 'createdBy'] },
          {
            type: 'board',
            groupBy: 'status',
            defaultFields: [
              'status',
              'channel',
              'labels',
              'progress',
              'score',
              'timeSpent',
              'website',
              'phone',
              'sku',
              'createdBy',
            ],
          },
          {
            type: 'calendar',
            start: 'dueAt',
            defaultFields: ['status', 'channel', 'progress', 'website', 'createdBy'],
          },
        ],
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        {
          type: 'row',
          fields: [
            {
              name: 'status',
              type: 'select',
              options: [
                { label: 'Backlog', value: 'backlog' },
                { label: 'Done', value: 'done', color: 'green' },
              ],
            },
            {
              name: 'channel',
              type: 'text',
              admin: {
                components: { Cell: '@frogbotai/next/client#FieldCell' },
                custom: { frogbot: { kind: { type: 'channel' } } },
              },
            },
            { name: 'dueAt', type: 'date' },
          ],
        },
        {
          name: 'labels',
          type: 'select',
          hasMany: true,
          options: labelOptions,
        },
        percentField({ name: 'progress', precision: 1 }),
        ratingField({ name: 'score' }),
        durationField({ name: 'timeSpent', format: 'h:mm' }),
        urlField({ name: 'website' }),
        phoneField({ name: 'phone' }),
        barcodeField({ name: 'sku' }),
        autonumberField({ name: 'number' }),
        createdByField({ name: 'createdBy' }),
        lastModifiedByField({ name: 'lastModifiedBy' }),
      ],
    },
    {
      slug: timesheetsSlug,
      admin: { useAsTitle: 'title' },
      versions: { drafts: true },
      fields: [
        { name: 'title', type: 'text', required: true },
        durationField({ name: 'logged', format: 'h:mm' }),
      ],
    },
  ],
  settings: [
    { ...robotSettings, Component: '/components/RobotSettings#RobotSettings' },
    {
      ...hiddenSettings,
      Component: '/components/RobotSettings#RobotSettings',
      access: () => false,
    },
  ],
  ai: {
    providers: {
      bedrock: {
        region: 'us-east-1',
        accessKeyId: 'browser-access-key',
        secretAccessKey: 'browser-secret-key',
      },
      openrouter: { apiKey: 'browser-openrouter-key' },
      browser: {
        type: 'openai-compatible',
        baseUrl: process.env.BROWSER_MODEL_URL || `http://127.0.0.1:${modelPort}/v1`,
        apiKey: 'browser-provider-key',
        models: [
          { id: 'questioner', mode: 'chat' },
          {
            id: 'thinker',
            mode: 'chat',
            reasoningOptions: [{ type: 'effort', values: ['low', 'high'] }],
          },
          {
            id: reasoningModels.deliberator,
            mode: 'chat',
            reasoningOptions: [{ type: 'effort', values: deliberatorEfforts }],
          },
          {
            id: reasoningModels.sprinter,
            mode: 'chat',
            reasoningOptions: [{ type: 'effort', values: ['high'] }],
          },
          {
            id: reasoningModels.verbose,
            mode: 'chat',
            reasoningOptions: [{ type: 'effort', values: [verboseEffort] }],
          },
        ],
      },
    },
  },
  agents: [
    {
      slug: agentSlug,
      profile: { name: 'Questioner agent' },
      model: {
        default: 'browser/questioner' as AgentModelId,
        options: [
          'browser/questioner',
          'browser/thinker',
          ...Object.values(reasoningModels).map((id) => `browser/${id}`),
        ] as AgentModelId[],
      },
      instructions: 'Ask before acting.',
      access: ({ req }) => Boolean(req.user),
      tools: [question, slack],
    },
    {
      slug: pickerAgentSlug,
      model: { default: 'browser/questioner' as AgentModelId, options: '*' },
      instructions: 'Choose a model before acting.',
      access: ({ req }) => Boolean(req.user),
    },
  ],
  endpoints: [
    {
      path: '/browser/reset',
      method: 'post',
      handler: async (req) => {
        if (!req.user) return new Response(null, { status: 401 });

        for (const collection of [messagesSlug, chatsSlug, turnsSlug, tasksSlug, timesheetsSlug]) {
          await req.frogbot.delete({ collection, where: {}, overrideAccess: true, req });
        }

        await req.frogbot.delete({
          collection: 'payload-preferences',
          where: { key: { in: [chatPicksPreference, `collection-${tasksSlug}`] } },
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
    {
      path: costsPath,
      method: 'post',
      handler: async (req) => {
        if (!req.user) return new Response(null, { status: 401 });

        await req.frogbot.delete({
          collection: usageLogsSlug as never,
          where: { requestId: { in: [costLogs.small.requestId, costLogs.key.requestId] } },
          overrideAccess: true,
          req,
        });
        await req.frogbot.delete({
          collection: apiKeysSlug as never,
          where: { name: { equals: costKeyName } },
          overrideAccess: true,
          req,
        });

        const key = await mintApiKey({
          req,
          collectionSlug: apiKeysSlug,
          tokenPrefix: 'fb',
          name: costKeyName,
        });

        const created: Array<{ id: number | string }> = [];

        for (const entry of [costLogs.small, costLogs.key]) {
          const isKey = entry === costLogs.key;
          const usageLog = await req.frogbot.create({
            collection: usageLogsSlug as never,
            data: {
              requestId: entry.requestId,
              user: req.user.id,
              model: entry.model,
              operation: 'chat.completions',
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              costUSD: entry.costUSD,
              requestedAt: new Date().toISOString(),
              ...(isKey ? { apiKey: key.id } : {}),
            } as never,
            overrideAccess: true,
            req,
          });

          created.push(usageLog as { id: number | string });
        }

        await req.frogbot.update({
          collection: usersSlug as never,
          id: req.user.id,
          data: { spendThisPeriodUSD: monthlySpendUSD } as never,
          overrideAccess: true,
          req,
        });

        return Response.json({
          userId: req.user.id,
          apiKeyId: key.id,
          usageLogIds: { small: created[0]?.id, key: created[1]?.id },
        });
      },
    },
    {
      path: costsPath,
      method: 'delete',
      handler: async (req) => {
        if (!req.user) return new Response(null, { status: 401 });

        await req.frogbot.delete({
          collection: usageLogsSlug as never,
          where: { requestId: { in: [costLogs.small.requestId, costLogs.key.requestId] } },
          overrideAccess: true,
          req,
        });
        await req.frogbot.delete({
          collection: apiKeysSlug as never,
          where: { name: { equals: costKeyName } },
          overrideAccess: true,
          req,
        });

        await req.frogbot.update({
          collection: usersSlug as never,
          id: req.user.id,
          data: { spendThisPeriodUSD: 0, monthlyBudget: null } as never,
          overrideAccess: true,
          req,
        });

        return Response.json({ reset: true });
      },
    },
  ],
  plugins: [apiKeysPlugin()],
});
