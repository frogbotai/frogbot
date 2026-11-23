function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
  const name = text(title) ?? text(username) ?? text(email);

  if (!name) return undefined;

  return name.includes('@') ? name.split('@')[0] || undefined : name.split(/\s+/)[0];
}
