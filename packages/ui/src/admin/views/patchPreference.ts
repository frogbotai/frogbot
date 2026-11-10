import { upsertPreferences } from '@payloadcms/ui/utilities/upsertPreferences';
import type { ServerFunction } from 'payload';

import { applyPreferencePatch, type PatchPreferenceArgs } from './preferences.js';

/**
 * Applies a patch to the signed-in user's preference on the server, merging into the value stored
 * at that moment, so a patch never puts back a sort or filter saved since the page loaded and a
 * failed read never overwrites the stored value.
 */
export const patchPreferenceHandler: ServerFunction<PatchPreferenceArgs, Promise<void>> = async ({
  key,
  patch,
  req,
}) => {
  if (!req.user) throw new Error('Unauthorized');

  if (
    typeof key !== 'string' ||
    !key ||
    !patch ||
    typeof patch !== 'object' ||
    Array.isArray(patch)
  ) {
    throw new Error('Invalid preference patch');
  }

  await upsertPreferences<Record<string, unknown>>({
    customMerge: (existing) => applyPreferencePatch(existing, patch),
    key,
    req,
    value: applyPreferencePatch(undefined, patch),
  });
};
