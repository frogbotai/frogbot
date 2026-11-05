import { definePlugin, type Plugin } from 'frogbot';

import { evalsRunCommand } from './cli.js';
import { createEvalCollections } from './collections.js';
import type { EvalsPluginOptions, EvalsResolvedOptions } from './options.js';
import { resolveOptions } from './options.js';
import { createEvalWorkflow } from './workflow.js';

export { checks } from './checks.js';
export { judge } from './judge.js';
export type { EvalsPluginOptions } from './options.js';
export type { EvalToolCall, Scorer, ScorerArgs, ScoreResult, ScorerFunction } from './scorers.js';
export { defineScorer } from './scorers.js';

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-evals': EvalsResolvedOptions;
  }
}

const evals = definePlugin<EvalsResolvedOptions>({
  slug: 'plugin-evals',
  order: 200,
  plugin: ({ config, options }) => {
    if (!config.ai) throw new Error('[plugin-evals] AI configuration is required.');

    const agents = (config.agents ?? []).map(({ slug }) => slug);

    if (agents.length === 0) {
      throw new Error('[plugin-evals] The config has no agents to evaluate.');
    }

    if (
      !config.ai.smallModel &&
      Object.values(options.scorers).some((scorer) => scorer.usesSmallModel)
    ) {
      throw new Error('[plugin-evals] judge() without a model needs ai.smallModel.');
    }

    return {
      ...config,
      collections: [
        ...config.collections,
        ...createEvalCollections({
          agents,
          scorers: Object.keys(options.scorers),
          access: options.access,
        }),
      ],
      jobs: {
        ...config.jobs,
        workflows: [...(config.jobs?.workflows ?? []), createEvalWorkflow(options)],
      },
      cli: {
        ...config.cli,
        commands: { ...config.cli?.commands, 'evals:run': evalsRunCommand },
      },
    };
  },
});

export function evalsPlugin(options: EvalsPluginOptions): Plugin {
  return evals(resolveOptions(options));
}
