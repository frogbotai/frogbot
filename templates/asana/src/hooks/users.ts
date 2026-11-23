import type { CollectionBeforeChangeHook } from 'frogbot';

/**
 * A user saved with no name takes their email as the name, so tasks, cards and the dashboard
 * never show "Untitled". The name stays editable, and a name set later replaces it.
 */
export const nameFromEmail: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
}) => {
  const name = data.name === undefined ? originalDoc?.name : data.name;

  if (typeof name === 'string' && name.trim()) return data;

  const email = data.email ?? originalDoc?.email;

  return typeof email === 'string' && email ? { ...data, name: email } : data;
};
