import type { CollectionBeforeChangeHook } from 'frogbot';

/**
 * A user saved with no name takes their email as the name, so tasks, cards and the dashboard
 * never show "Untitled". The name stays editable, a name set later replaces it, and a name that
 * was only the old email follows an email change.
 */
export const nameFromEmail: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
}) => {
  const email = data.email ?? originalDoc?.email;
  const name = data.name === undefined ? originalDoc?.name : data.name;
  const blank = typeof name !== 'string' || !name.trim();
  const followsEmail =
    originalDoc?.email !== undefined &&
    name === originalDoc.email &&
    originalDoc.name === name;

  if (!blank && !followsEmail) return data;

  return typeof email === 'string' && email ? { ...data, name: email } : data;
};
