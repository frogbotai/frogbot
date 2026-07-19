export function formatZodPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      out += `[${segment}]`;
    } else if (typeof segment === 'string') {
      out += out === '' ? segment : `.${segment}`;
    }
  }
  return out || '(body)';
}
