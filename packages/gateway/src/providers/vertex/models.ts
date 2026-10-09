import { DEFAULT_MODEL_CATALOG } from '../catalog.data.js';

/** Whether a `vertex/<id>` model is Claude, served through Google's Anthropic adapter. */
export function isVertexAnthropicModel(modelId: string): boolean {
  return DEFAULT_MODEL_CATALOG.get(modelId)?.sdk?.npm === '@ai-sdk/google-vertex/anthropic';
}
