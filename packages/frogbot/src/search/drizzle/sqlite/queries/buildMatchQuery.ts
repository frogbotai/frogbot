const tokenPattern = /(-)?(?:"([^"]*)"?|([^\s"]+))/g;
const termPattern = /[\p{L}\p{M}\p{N}]+/gu;

function toPhrase(value: string): string | undefined {
  const terms = value.match(termPattern);

  return terms?.length ? `"${terms.join(' ')}"` : undefined;
}

export function buildMatchQuery(text: string): string | undefined {
  const groups: string[][] = [];
  const excluded: string[] = [];
  let or = false;

  for (const [, negated, quoted, word] of text.matchAll(tokenPattern)) {
    if (!negated && quoted === undefined && word?.toLowerCase() === 'or') {
      or = groups.length > 0;

      continue;
    }

    const phrase = toPhrase(quoted ?? word ?? '');

    if (!phrase) continue;

    if (negated) {
      excluded.push(phrase);
    } else if (or) {
      groups[groups.length - 1].push(phrase);
    } else {
      groups.push([phrase]);
    }

    or = false;
  }

  if (!groups.length) return undefined;

  const included = groups
    .map((group) => (group.length > 1 ? `(${group.join(' OR ')})` : group[0]))
    .join(' AND ');

  return excluded.length ? `(${included}) NOT (${excluded.join(' OR ')})` : included;
}
