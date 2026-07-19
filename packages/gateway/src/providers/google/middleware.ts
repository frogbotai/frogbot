import type { BeforeUpstreamHook } from '../../hooks.js';

export const googleEmbedDimensions: BeforeUpstreamHook = (args) => {
  if (args.operation !== 'embeddings') return;

  const unknown = args.providerOptions.unknown;
  const dimensions = unknown?.dimensions;
  if (typeof dimensions !== 'number') return;

  args.providerOptions.google = {
    ...(args.providerOptions.google ?? {}),
    outputDimensionality: dimensions,
  };
  delete unknown.dimensions;
};

export const googleBeforeUpstream: BeforeUpstreamHook[] = [
  googleEmbedDimensions,
];
