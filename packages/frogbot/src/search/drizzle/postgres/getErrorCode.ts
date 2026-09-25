export function getErrorCode(error: unknown): string | undefined {
  for (let current = error; current && typeof current === 'object';) {
    if ('code' in current && typeof current.code === 'string') return current.code;

    current = 'cause' in current ? current.cause : undefined;
  }

  return undefined;
}
