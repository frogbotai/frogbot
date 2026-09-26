function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function matches({
  actual,
  expected,
  exactKeys,
}: {
  actual: unknown;
  expected: unknown;
  exactKeys: boolean;
}): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;

    const remaining = [...actual];

    return expected.every((item) => {
      const index = remaining.findIndex((candidate) =>
        matches({ actual: candidate, expected: item, exactKeys: false }),
      );

      if (index === -1) return false;

      remaining.splice(index, 1);

      return true;
    });
  }

  if (isRecord(expected)) {
    if (!isRecord(actual)) return false;

    if (exactKeys && Object.keys(actual).length !== Object.keys(expected).length) return false;

    return Object.entries(expected).every(([key, value]) =>
      matches({
        actual: actual[key],
        expected: value,
        exactKeys: key === 'fields' && isRecord(value),
      }),
    );
  }

  return actual === expected;
}

export function isSearchIndexDefinitionEqual({
  actual,
  expected,
}: {
  actual: unknown;
  expected: unknown;
}): boolean {
  return matches({ actual, expected, exactKeys: false });
}
