import type { CredentialSource } from '../types/connections.js';
import type { Piece } from '../types/piece.js';

export function resolveCredentialSources({
  sources,
  assignments,
  pieces,
}: {
  sources: readonly CredentialSource[];
  assignments: Readonly<Record<string, string>>;
  pieces: readonly Piece[];
}): Record<string, string> {
  const keys = new Set<string>();
  for (const source of sources) {
    if (!source.key.trim()) throw new Error('[frogbot] Every credential source requires a key.');
    if (keys.has(source.key)) throw new Error(`[frogbot] Duplicate credential source key '${source.key}'.`);
    keys.add(source.key);
  }

  const resolved: Record<string, string> = {};
  for (const piece of pieces) {
    if (piece.credentialType === 'none') continue;
    const credentialType = piece.credentialType;
    const claims = sources.filter((source) =>
      source.services.includes(piece.service) && source.credentialTypes.includes(credentialType),
    );
    const assignment = assignments[piece.service];
    if (assignment) {
      if (!claims.some((source) => source.key === assignment)) {
        throw new Error(`[frogbot] Credential source '${assignment}' cannot provide '${piece.service}'.`);
      }
      resolved[piece.service] = assignment;
      continue;
    }
    if (claims.length === 0) {
      throw new Error(`[frogbot] Piece '${piece.service}' requires credentials but no source claims it.`);
    }
    if (claims.length > 1) {
      throw new Error(`[frogbot] Piece '${piece.service}' has multiple credential sources (${claims.map((source) => source.key).join(', ')}). Set connections.assignments.${piece.service}.`);
    }
    resolved[piece.service] = claims[0].key;
  }
  return resolved;
}
