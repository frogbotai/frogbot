import {
  createCssVariablesTheme,
  createHighlighterCore,
  type HighlighterCore,
  type LanguageInput,
  type ThemedToken,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

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
const loading = new Map<Grammar, Promise<void>>();

function getHighlighter() {
  highlighter ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine({ forgiving: true }),
    langs: [],
    themes: [theme],
  });

  return highlighter;
}

const grammars = {
  bash: () => import('@shikijs/langs/bash'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  css: () => import('@shikijs/langs/css'),
  diff: () => import('@shikijs/langs/diff'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
  go: () => import('@shikijs/langs/go'),
  graphql: () => import('@shikijs/langs/graphql'),
  html: () => import('@shikijs/langs/html'),
  ini: () => import('@shikijs/langs/ini'),
  java: () => import('@shikijs/langs/java'),
  javascript: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  jsx: () => import('@shikijs/langs/jsx'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  lua: () => import('@shikijs/langs/lua'),
  markdown: () => import('@shikijs/langs/markdown'),
  php: () => import('@shikijs/langs/php'),
  powershell: () => import('@shikijs/langs/powershell'),
  python: () => import('@shikijs/langs/python'),
  ruby: () => import('@shikijs/langs/ruby'),
  rust: () => import('@shikijs/langs/rust'),
  scss: () => import('@shikijs/langs/scss'),
  sql: () => import('@shikijs/langs/sql'),
  svelte: () => import('@shikijs/langs/svelte'),
  swift: () => import('@shikijs/langs/swift'),
  toml: () => import('@shikijs/langs/toml'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  vue: () => import('@shikijs/langs/vue'),
  xml: () => import('@shikijs/langs/xml'),
  yaml: () => import('@shikijs/langs/yaml'),
} satisfies Record<string, LanguageInput>;

type Grammar = keyof typeof grammars;

const aliases: Record<string, Grammar> = {
  'c#': 'csharp',
  'c++': 'cpp',
  cc: 'cpp',
  cjs: 'javascript',
  cs: 'csharp',
  cts: 'typescript',
  docker: 'dockerfile',
  gql: 'graphql',
  h: 'c',
  hpp: 'cpp',
  js: 'javascript',
  kt: 'kotlin',
  md: 'markdown',
  mjs: 'javascript',
  mts: 'typescript',
  ps1: 'powershell',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  svg: 'xml',
  ts: 'typescript',
  yml: 'yaml',
  zsh: 'bash',
};

function isGrammar(name: string): name is Grammar {
  return Object.hasOwn(grammars, name);
}

function grammarFor(language: string): Grammar | undefined {
  const name = language.toLowerCase();
  if (isGrammar(name)) return name;

  return Object.hasOwn(aliases, name) ? aliases[name] : undefined;
}

/**
 * Highlights `code` as `language`, loading Shiki and that language's grammar on first use.
 * Resolves `undefined` for a language outside the curated list or a grammar that fails, so the
 * block stays plain.
 */
export async function highlight(
  code: string,
  language: string,
): Promise<HighlightedLine[] | undefined> {
  const lang = grammarFor(language);
  if (!lang) return undefined;

  try {
    const shiki = await getHighlighter();
    let loaded = loading.get(lang);

    if (!loaded) {
      loaded = shiki.loadLanguage(grammars[lang]);
      loading.set(lang, loaded);
    }

    await loaded;

    return shiki.codeToTokensBase(code, { lang, theme: THEME });
  } catch {
    return undefined;
  }
}
