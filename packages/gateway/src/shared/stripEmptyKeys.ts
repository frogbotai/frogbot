/**
 * Strips top-level empty-string keys from an object.
 * Some providers (e.g. Anthropic) emit `{"": {}, ...}` in tool args.
 * Only strips at the top level — nested empty keys are preserved.
 */
export function stripEmptyKeys(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  if ('' in obj) {
    (obj as Record<string, unknown>)[''] = undefined;
  }
  return obj;
}
