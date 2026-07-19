// Azure OpenAI canonical ID mapping.
//
// In Azure, model IDs ARE deployment names. This module provides a mapping
// from common model shorthand names to their likely deployment names, plus
// a pass-through for custom deployment names.

/**
 * Common Azure deployment name patterns.
 * Maps friendly model names to typical Azure deployment names.
 * Users can always use their exact deployment name directly.
 */
export const AZURE_CANONICAL_IDS: Record<string, string> = {
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-4': 'gpt-4',
  'gpt-35-turbo': 'gpt-35-turbo',
  'o1': 'o1',
  'o1-mini': 'o1-mini',
  'o1-preview': 'o1-preview',
  'o3': 'o3',
  'o3-mini': 'o3-mini',
  'o4-mini': 'o4-mini',
};

/**
 * Resolve an Azure model ID. Since Azure uses deployment names, this is
 * effectively a pass-through — users specify their exact deployment name,
 * and the canonical map contains identity mappings only.
 */
export function resolveAzureModelId(modelId: string): string {
  return AZURE_CANONICAL_IDS[modelId] ?? modelId;
}
