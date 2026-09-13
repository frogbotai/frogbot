import type { WorkflowConfig as PayloadWorkflowConfig } from 'payload';
import { dynamicImport } from 'payload';

import type { JobsConfig, WorkflowHandler } from '../types.js';
import type { WaitpointOptions } from './types.js';
import { createWaitFor } from './waitFor.js';

async function importWorkflowHandler(path: string): Promise<WorkflowHandler> {
  const [modulePath, exportName] = path.split('#');
  const module = await dynamicImport<Record<string, unknown>>(modulePath);
  const handler = (exportName && module[exportName]) || module.default || module;

  if (typeof handler !== 'function') {
    throw new Error(`FrogBot workflow handler '${path}' does not export a function.`);
  }

  return handler as WorkflowHandler;
}

export function wrapWorkflow({
  workflow,
  config,
}: {
  workflow: NonNullable<JobsConfig['workflows']>[number];
  config: WaitpointOptions;
}): PayloadWorkflowConfig {
  const handler = workflow.handler;

  if (typeof handler !== 'function' && typeof handler !== 'string') {
    return workflow as PayloadWorkflowConfig;
  }

  return {
    ...workflow,
    handler: async (args) => {
      const run = typeof handler === 'string' ? await importWorkflowHandler(handler) : handler;
      const { waitFor, isWaiting } = createWaitFor({ ...args, config });

      try {
        await run({ ...args, waitFor });
      } catch (error) {
        if (!isWaiting(error)) throw error;
      }
    },
  };
}
