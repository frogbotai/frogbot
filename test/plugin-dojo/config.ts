import { sharpTransformer } from '@frogbotai/transformer-sharp';
import type { AgentConfig, CollectionConfig } from 'frogbot';
import { general } from 'frogbot/agents';
import { todoTools } from 'frogbot/tools';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { appModel, filesSlug, routedAgentSlug, thumbnailSize, usersSlug } from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
};

const Files: CollectionConfig = {
  slug: filesSlug,
  file: true,
  fields: [],
};

const assistant: AgentConfig = {
  slug: 'assistant',
  instructions: 'You are a concise and friendly assistant.',
};

const routed: AgentConfig = {
  slug: routedAgentSlug,
  model: appModel,
  instructions: 'Answer briefly.',
};

export default await buildTestConfig({
  collections: [Users, Files],
  tools: [...todoTools],
  ai: {
    defaultModel: appModel,
    providers: { openai: true },
  },
  agents: [general(), assistant, routed],
  upload: {
    transformers: [
      sharpTransformer({
        collections: {
          [filesSlug]: { variants: [{ name: thumbnailSize, width: 16, height: 16 }] },
        },
      }),
    ],
  },
  plugins: [],
});
