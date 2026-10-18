import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';
import { mcpServer } from 'frogbot/tools';

export const config = buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  collections: [{ slug: 'users', auth: true, fields: [] }],
  ai: { providers: { openai: { apiKey: process.env.OPENAI_API_KEY! } } },
  tools: [
    mcpServer({
      name: 'docs',
      type: 'remote',
      url: 'https://docs.example.com/mcp',
      headers: { Authorization: `Bearer ${process.env.DOCS_MCP_TOKEN}` },
    }),
  ],
  agents: [
    {
      slug: 'researcher',
      model: 'openai/gpt-5.4-mini',
      instructions: 'Use the browser tools to read pages.',
      tools: [
        mcpServer({
          name: 'sidekick',
          type: 'local',
          command: ['npx', '-y', '@frogbotai/sidekick-mcp'],
          environment: { SIDEKICK_TOKEN: process.env.SIDEKICK_TOKEN! },
          timeout: { execution: 10 * 60_000 },
        }),
      ],
    },
  ],
});
