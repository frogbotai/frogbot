/**
 * A Zendesk request body from camelCase input: `externalId` becomes `external_id`, and empty
 * strings, empty arrays and undefined values are dropped. Nested values are sent as given.
 */
export function zendeskBody(input: Record<string, unknown>, omitted: readonly string[] = []) {
  return Object.fromEntries(
    Object.entries(input)
      .filter(
        ([key, value]) =>
          !omitted.includes(key) &&
          value !== undefined &&
          value !== '' &&
          !(Array.isArray(value) && value.length === 0),
      )
      .map(([key, value]) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        value,
      ]),
  );
}
