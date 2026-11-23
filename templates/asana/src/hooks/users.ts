import type { CollectionBeforeChangeHook, FieldHook } from 'frogbot';

function normalized(email: unknown): string | undefined {
  return typeof email === 'string' && email.trim()
    ? email.trim().toLowerCase()
    : undefined;
}

/**
 * A user saved with no name takes their email as the name, so tasks, cards and the dashboard
 * never show "Untitled". The name stays editable, a name set later replaces it, and a name that
 * was only the old email follows an email change. The email is trimmed and lowercased first, the
 * way it is stored.
 */
export const nameFromEmail: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
}) => {
  const email = normalized(data.email ?? originalDoc?.email);
  const name = data.name === undefined ? originalDoc?.name : data.name;
  const blank = typeof name !== 'string' || !name.trim();
  const followsEmail =
    originalDoc?.email !== undefined &&
    name === originalDoc.email &&
    originalDoc.name === name;

  if (!blank && !followsEmail) return data;

  return email ? { ...data, name: email } : data;
};

/**
 * Reads a blank name as the user's email, so users saved before `nameFromEmail` existed show
 * their email, not "Untitled", wherever they appear. A read that selected only the name looks
 * the email up.
 */
export const nameOrEmail: FieldHook = async ({ req, siblingData, value }) => {
  if (typeof value === 'string' && value.trim()) return value;

  const sibling = (siblingData ?? {}) as {
    email?: unknown;
    id?: number | string;
  };

  const email = normalized(sibling.email);

  if (email || sibling.id === undefined) return email ?? value;

  const user = await req.frogbot
    .findByID({
      collection: 'users',
      depth: 0,
      disableErrors: true,
      id: sibling.id,
      overrideAccess: false,
      req,
      select: { email: true },
    })
    .catch(() => null);

  return normalized(user?.email) ?? value;
};
