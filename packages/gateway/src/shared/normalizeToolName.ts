/**
 * Normalizes a tool name to comply with OpenAI's function name constraints:
 * - Only [a-zA-Z0-9_\-.] allowed
 * - Max 128 characters
 */
export function normalizeToolName(name: string): string {
  let out = '';
  for (let i = 0; i < name.length; i++) {
    if (out.length === 128) break;

    const c = name.charCodeAt(i);

    if (
      (c >= 48 && c <= 57) ||  // 0-9
      (c >= 65 && c <= 90) ||  // A-Z
      (c >= 97 && c <= 122) || // a-z
      c === 95 ||              // _
      c === 45 ||              // -
      c === 46                 // .
    ) {
      out += name[i];
    } else {
      out += '_';
    }
  }
  return out;
}
