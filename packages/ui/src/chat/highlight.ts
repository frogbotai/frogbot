import {
  createCssVariablesTheme,
  createHighlighterCore,
  type HighlighterCore,
  type ThemedToken,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';

/** One highlighted line: its tokens, each with a CSS colour that reads FrogBot's theme tokens. */
export type HighlightedLine = ThemedToken[];

const THEME = 'frogbot';

const theme = createCssVariablesTheme({
  name: THEME,
  variablePrefix: '--fb-code-',
  variableDefaults: {
    foreground: 'var(--color-text)',
    background: 'transparent',
    'token-comment': 'var(--color-text-tertiary)',
    'token-constant': 'var(--color-text-warning)',
    'token-function': 'var(--color-text-selected)',
    'token-keyword': 'var(--color-text-danger)',
    'token-link': 'var(--color-text-selected)',
    'token-parameter': 'var(--color-text)',
    'token-punctuation': 'var(--color-text-secondary)',
    'token-string': 'var(--color-text-success)',
    'token-string-expression': 'var(--color-text-success)',
    'ansi-black': 'var(--color-text)',
    'ansi-red': 'var(--color-text-danger)',
    'ansi-green': 'var(--color-text-success)',
    'ansi-yellow': 'var(--color-text-warning)',
    'ansi-blue': 'var(--color-text-selected)',
    'ansi-magenta': 'var(--color-text-danger)',
    'ansi-cyan': 'var(--color-text-selected)',
    'ansi-white': 'var(--color-text-secondary)',
    'ansi-bright-black': 'var(--color-text-tertiary)',
    'ansi-bright-red': 'var(--color-text-danger)',
    'ansi-bright-green': 'var(--color-text-success)',
    'ansi-bright-yellow': 'var(--color-text-warning)',
    'ansi-bright-blue': 'var(--color-text-selected)',
    'ansi-bright-magenta': 'var(--color-text-danger)',
    'ansi-bright-cyan': 'var(--color-text-selected)',
    'ansi-bright-white': 'var(--color-text-secondary)',
  },
});

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter() {
  highlighter ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine({ forgiving: true }),
    langs: [],
    themes: [theme],
  });

  return highlighter;
}

function isBundled(language: string): language is keyof typeof bundledLanguages {
  return Object.hasOwn(bundledLanguages, language);
}

/**
 * Highlights `code` as `language`, loading Shiki and that language's grammar on first use.
 * Resolves `undefined` for an unknown language or a grammar that fails, so the block stays plain.
 */
export async function highlight(
  code: string,
  language: string,
): Promise<HighlightedLine[] | undefined> {
  const lang = language.toLowerCase();
  if (!isBundled(lang)) return undefined;

  try {
    const shiki = await getHighlighter();
    const loaded = shiki.getLoadedLanguages().includes(lang);
    if (!loaded) await shiki.loadLanguage(bundledLanguages[lang]);

    return shiki.codeToTokensBase(code, { lang, theme: THEME });
  } catch {
    return undefined;
  }
}
