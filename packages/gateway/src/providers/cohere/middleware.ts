import type { BeforeUpstreamHook } from '../../hooks.js';

function supportsOutputDimension(model: string): boolean {
  return !model.includes('-light-');
}

export const cohereEmbedDimensions: BeforeUpstreamHook = (args) => {
  if (args.operation !== 'embeddings') return;

  const unknown = args.providerOptions.unknown;
  const dimensions = unknown?.dimensions;
  if (typeof dimensions !== 'number') return;
  if (!supportsOutputDimension(args.model)) return;

  args.providerOptions.cohere = {
    ...(args.providerOptions.cohere ?? {}),
    outputDimension: dimensions,
  };

  delete unknown.dimensions;
};

export const cohereBeforeUpstream: BeforeUpstreamHook[] = [cohereEmbedDimensions];
