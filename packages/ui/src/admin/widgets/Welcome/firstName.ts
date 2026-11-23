function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function call(name: string): string | undefined {
  return (/^\S*@\S*$/.test(name) ? name.split('@')[0] : name.split(/\s+/)[0]) || undefined;
}

/**
 * What a greeting calls someone: the first word of their name, or the part of an email before the
 * `@` when the name is an email or missing. `Ada Lovelace` → `Ada`, `ada@example.com` → `ada`.
 */
export function firstName({
  email,
  title,
  username,
}: {
  email?: unknown;
  title?: unknown;
  username?: unknown;
}): string | undefined {
  const name = text(title) ?? text(username);
  const fallback = text(email);

  return (name && call(name)) ?? (fallback && call(fallback));
}
