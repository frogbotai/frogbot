// Merge a base chat collection into a user-authored collection with the
// same slug — FrogBot's mirror of Payload's `mergeBaseFields` semantics
// (the `auth: true` machinery, not exported from Payload):
//
//   - user props win per-key (deep merge, user over base)
//   - base hooks run first, then user hooks — both run, base is foundational
//   - base fields missing from the user's collection are appended
//   - a base field's `type` is locked; the user may customize other props
//     (label, admin, index, hooks, relationTo) but not `type`
//   - reserved field names throw at build

import type { CollectionConfig } from '../types/collection.js';
import type { Field } from '../types/fields.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMergeUserWins(base: unknown, user: unknown): unknown {
  if (isPlainObject(base) && isPlainObject(user)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(user)) {
      out[key] = key in base ? deepMergeUserWins(base[key], value) : value;
    }
    return out;
  }
  return user;
}

function concatHooks(
  base: Record<string, unknown[]> | undefined,
  user: Record<string, unknown[]> | undefined,
): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const key of new Set([...Object.keys(base ?? {}), ...Object.keys(user ?? {})])) {
    out[key] = [...(base?.[key] ?? []), ...(user?.[key] ?? [])];
  }
  return out;
}

function hasSubFields(field: Field): field is Field & { fields: Field[] } {
  return 'fields' in field && Array.isArray((field as { fields?: unknown }).fields);
}

function fieldName(field: Field): string | undefined {
  return 'name' in field && typeof field.name === 'string' ? field.name : undefined;
}

function fieldType(field: Field): string | undefined {
  return 'type' in field && typeof field.type === 'string' ? field.type : undefined;
}

function mergeField(base: Field, user: Field, slug: string): Field {
  const baseType = fieldType(base);
  const userType = fieldType(user);
  if (baseType !== undefined && userType !== undefined && baseType !== userType) {
    throw new Error(
      `[frogbot] Field '${fieldName(base)}' on collection '${slug}' has type '${baseType}' required by ` +
        `chat persistence and cannot be changed to '${userType}'.`,
    );
  }

  const merged = deepMergeUserWins(base, user) as Field;
  if ('hooks' in base || 'hooks' in user) {
    (merged as { hooks?: unknown }).hooks = concatHooks(
      (base as { hooks?: Record<string, unknown[]> }).hooks,
      (user as { hooks?: Record<string, unknown[]> }).hooks,
    );
  }
  if (hasSubFields(base) && hasSubFields(user)) {
    (merged as { fields: Field[] }).fields = mergeFields(user.fields, base.fields, slug);
  }
  return merged;
}

function mergeFields(userFields: Field[], baseFields: Field[], slug: string): Field[] {
  const out = [...userFields];
  for (const baseField of baseFields) {
    const name = fieldName(baseField);
    const idx = out.findIndex((f) => name !== undefined && fieldName(f) === name);
    if (idx === -1) {
      out.push(baseField);
    } else {
      out[idx] = mergeField(baseField, out[idx], slug);
    }
  }
  return out;
}

export type MergeChatCollectionProps = {
  user: CollectionConfig;
  base: CollectionConfig;
  reservedFields: string[];
};

export function mergeChatCollection({ user, base, reservedFields }: MergeChatCollectionProps): CollectionConfig {
  for (const reserved of reservedFields) {
    if (user.fields.some((f) => fieldName(f) === reserved)) {
      throw new Error(
        `[frogbot] Field '${reserved}' on collection '${user.slug}' is reserved by chat persistence.`,
      );
    }
  }

  return {
    ...base,
    ...user,
    fields: mergeFields(user.fields, base.fields, user.slug),
    access: { ...base.access, ...user.access },
    admin: { ...base.admin, ...user.admin },
    hooks: concatHooks(base.hooks, user.hooks),
  };
}
