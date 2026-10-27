const importsFrogBotRootComponent =
  /\bimport\s*\{[^}]*\bRoot(?:Layout|Page)\b[^}]*\}\s*from\s*['"]@frogbotai\/next\/(?:layouts|views)['"]/;

const declaresInstant =
  /\b(?:const|let|var|function|class)\s+instant\b|\bexport\s*\{[^}]*\binstant\b[^}]*\}/;

/**
 * Webpack and Turbopack loader that `withFrogBot` adds when `cacheComponents` is on. It opts the
 * FrogBot admin layout and page out of instant navigation with `export const instant = false`,
 * as Payload's `instantLoader` does for `@payloadcms/next`.
 */
export default function instantLoader(source: string): string {
  if (!importsFrogBotRootComponent.test(source) || declaresInstant.test(source)) return source;

  return `${source}\nexport const instant = false\n`;
}
