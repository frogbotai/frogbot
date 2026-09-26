import type { SearchCapabilities, SearchCapability } from 'frogbot/search';

const maxVectorDimensions = 8192;

const languages = new Set([
  'arabic',
  'armenian',
  'basque',
  'bengali',
  'brazilian',
  'bulgarian',
  'catalan',
  'chinese',
  'cjk',
  'czech',
  'danish',
  'dutch',
  'english',
  'finnish',
  'french',
  'galician',
  'german',
  'greek',
  'hindi',
  'hungarian',
  'indonesian',
  'irish',
  'italian',
  'japanese',
  'korean',
  'kuromoji',
  'latvian',
  'lithuanian',
  'morfologik',
  'nori',
  'norwegian',
  'persian',
  'polish',
  'portuguese',
  'romanian',
  'russian',
  'smartcn',
  'sorani',
  'spanish',
  'swedish',
  'thai',
  'turkish',
  'ukrainian',
]);

export const capabilities: SearchCapabilities = ({ index }) => {
  const language = index.lexical?.language;
  const dimensions = index.vector?.dimensions ?? 0;

  const lexical: SearchCapability =
    language && !languages.has(language)
      ? {
          unsupported: 'engine-gap',
          detail: `MongoDB search has no built-in analyzer for the '${language}' language.`,
        }
      : 'supported';

  const vector: SearchCapability =
    dimensions > maxVectorDimensions
      ? {
          unsupported: 'engine-gap',
          detail: `MongoDB vector search indexes support at most ${maxVectorDimensions} dimensions.`,
        }
      : 'supported';

  return {
    lexical,
    vector,
    hybrid: lexical === 'supported' ? vector : lexical,
  };
};
