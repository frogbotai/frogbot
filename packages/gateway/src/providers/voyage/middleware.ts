import type { BeforeUpstreamHook } from '../../hooks.js';

export const voyageEmbedDimensions: BeforeUpstreamHook = (args) => {
  if (args.operation !== 'embeddings') return;

  const unknown = args.providerOptions.unknown;
  const dimensions = unknown?.dimensions;
  if (typeof dimensions !== 'number') return;

  args.providerOptions.voyage = {
    ...(args.providerOptions.voyage ?? {}),
    outputDimension: dimensions,
  };

  delete unknown.dimensions;
};

export const voyageBeforeUpstream: BeforeUpstreamHook[] = [voyageEmbedDimensions];
