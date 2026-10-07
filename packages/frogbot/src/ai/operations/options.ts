// Runtime-checked conversions from FrogBot's public option types to AI SDK types.

import type { generateText, JSONValue } from 'ai';

type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]['providerOptions']>;
type JSONObject = ProviderOptions[string];
type ImageSize = `${number}x${number}`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isJSONValue(value: unknown, ancestors: Set<object>): value is JSONValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return false;
    ancestors.add(value);
    const valid = value.every((item) => isJSONValue(item, ancestors));
    ancestors.delete(value);
    return valid;
  }
  return isJSONObject(value, ancestors);
}

function isJSONObject(value: unknown, ancestors = new Set<object>()): value is JSONObject {
  if (!isPlainObject(value) || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every(
    (item) => item === undefined || isJSONValue(item, ancestors),
  );
  ancestors.delete(value);
  return valid;
}

function isProviderOptions(options: Record<string, unknown>): options is ProviderOptions {
  return Object.values(options).every((entry) => isJSONObject(entry));
}

export function toProviderOptions(
  options: Record<string, unknown> | undefined,
): ProviderOptions | undefined {
  if (options === undefined) return undefined;
  // An absent provider entry (`{ openai: undefined }`) means "no options", as in the AI SDK.
  const present = Object.values(options).some((entry) => entry === undefined || entry === null)
    ? Object.fromEntries(
        Object.entries(options).filter(([, entry]) => entry !== undefined && entry !== null),
      )
    : options;
  if (isProviderOptions(present)) return present;
  const key = Object.keys(present).find((name) => !isJSONObject(present[name]));
  throw new TypeError(`[frogbot] providerOptions.${key} must be a plain object of JSON values.`);
}

function isImageSize(size: string): size is ImageSize {
  return /^\d+x\d+$/.test(size);
}

export function toImageSize(size: string | undefined): ImageSize | undefined {
  if (size === undefined || isImageSize(size)) return size;
  throw new TypeError(
    `[frogbot] Image size must be '{width}x{height}' (e.g. '1024x1024'), got '${size}'.`,
  );
}
