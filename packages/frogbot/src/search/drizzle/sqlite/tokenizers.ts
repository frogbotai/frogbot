const tokenizers: Record<string, string> = {
  english: 'porter unicode61 remove_diacritics 2',
  simple: 'unicode61 remove_diacritics 2',
};

export function getTokenizer(language = 'simple'): string | undefined {
  return Object.hasOwn(tokenizers, language) ? tokenizers[language] : undefined;
}
