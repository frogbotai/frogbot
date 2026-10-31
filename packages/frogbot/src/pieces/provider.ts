import type { PieceDefinition } from './types.js';

export function validateProvider({ slug, auth, provider }: PieceDefinition): void {
  if (!provider) return;

  if (!auth) throw new Error(`[frogbot] Piece '${slug}' declares a provider but no auth schema.`);

  if (
    typeof provider.name !== 'string' ||
    !provider.name ||
    typeof provider.credential !== 'function' ||
    [provider.models, provider.middleware, provider.notice].some(
      (hook) => hook !== undefined && typeof hook !== 'function',
    )
  ) {
    throw new Error(
      `[frogbot] Piece '${slug}' provider requires a name, a credential function and optional models, middleware and notice functions.`,
    );
  }
}
