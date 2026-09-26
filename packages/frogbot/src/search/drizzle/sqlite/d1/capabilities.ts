import type { SearchCapabilities, SearchCapability } from '../../../../database/types.js';
import { getLexicalCapability, notConfigured } from '../capabilities.js';

const vectorGap: SearchCapability = {
  unsupported: 'engine-gap',
  detail:
    "Cloudflare D1 has no native vector search; remove 'vector' from this index. Vector fields still store values without a search index.",
};

export const capabilities: SearchCapabilities = ({ index }) => ({
  hybrid: index.hybrid ? vectorGap : notConfigured('hybrid'),
  lexical: getLexicalCapability(index),
  vector: index.vector ? vectorGap : notConfigured('vector'),
});
