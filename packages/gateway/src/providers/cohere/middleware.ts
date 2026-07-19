// Cohere provider middleware — beforeUpstream hooks.
//
// Re-homes the neutral `unknown.dimensions` embedding knob into Cohere's
// `providerOptions.cohere.outputDimension` namespace (the key the shipped
// @ai-sdk/cohere embedding model reads).

import type { BeforeUpstreamHook } from '../../hooks.js';

// Light-weight Cohere embedding models do not support output dimension
// truncation; forwarding the knob makes the upstream reject the request.
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

export const cohereBeforeUpstream: BeforeUpstreamHook[] = [
  cohereEmbedDimensions,
];
