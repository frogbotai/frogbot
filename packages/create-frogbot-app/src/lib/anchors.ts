export const CONFIG_ANCHORS = {
  dbImport: "import { sqliteAdapter } from '@frogbotai/db-sqlite';\n",
  db: "  db: sqliteAdapter({\n    client: { url: process.env.DATABASE_URL || '' },\n  }),\n",
  generalImport: "import { general } from 'frogbot/agents';\n",
  toolsImport: "import { todoTools } from 'frogbot/tools';\n",
  assistantImport: "import { assistant } from './agents/assistant';\n",
  tools: '  tools: [...todoTools],\n',
  ai: "  ai: {\n    defaultModel: 'zen/big-pickle',\n    providers: {\n      zen: {\n        type: 'openai-compatible',\n        baseUrl: 'https://opencode.ai/zen/v1',\n        apiKey: 'public',\n        models: [{ id: 'big-pickle', mode: 'chat' }],\n      },\n    },\n  },\n",
  agents: '  agents: [general(), assistant],\n',
} as const;

export const PACKAGE_DEPENDENCY_ANCHORS = [
  '@frogbotai/db-sqlite',
  'drizzle-kit',
  'libsql',
] as const;

export const ENV_ANCHORS = [
  'DATABASE_URL=file:./frogbot.db\n',
  'FROGBOT_SECRET=YOUR_SECRET_HERE\n',
] as const;

export class AnchorError extends Error {}

export function replaceOnce(
  source: string,
  anchor: string,
  replacement: string,
  file: string,
  name: string,
): string {
  const index = source.indexOf(anchor);

  if (index === -1 || source.indexOf(anchor, index + anchor.length) !== -1) {
    throw new AnchorError(`Expected exactly one ${name} anchor in ${file}.`);
  }

  return source.slice(0, index) + replacement + source.slice(index + anchor.length);
}
