const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI = new RegExp(
  String.raw`${ESC}\[[0-9;?]*[ -/]*[@-~]|${ESC}\][^${BEL}]*(?:${BEL}|${ESC}\\)`,
  'g',
);

const LINE_START = new RegExp(String.raw`${ESC}\[(?:2K|1?G)`, 'g');

const MAX_LENGTH = 200;

/**
 * Strips colour codes and keeps what a terminal would show of a line redrawn by a spinner (`\r`,
 * or erase-line and cursor-to-start codes): its last frame.
 */
export function plainText(text: string): string {
  return text
    .replace(LINE_START, '\r')
    .replace(ANSI, '')
    .split('\n')
    .map((line) => line.replace(/\r+$/, '').split('\r').at(-1) ?? '')
    .join('\n');
}

const typeScriptDiagnostic = /\S+\(\d+,\d+\): error TS\d+: .*/;
const nextTypeError = /^Type error: /;
const errorLine = /^(?:⨯\s*)?(?:\[?[\w.]*Error\]?(?: \[\w+\])?: .*)/;
const causedBy = /^\s*(?:\[cause\]:|Caused by:)\s*/i;

const noise = [
  /^\s*at\s/,
  /^\s*\(\d+ internal frames? hidden\)/,
  /^Failed to type check\.?$/,
  /ELIFECYCLE|ERR_PNPM_/,
  /^\s*[\^~]+\s*$/,
  /^Next\.js build worker exited/,
  /^\s*[{}[\]]\s*$/,
];

const cap = (line: string) =>
  line.length > MAX_LENGTH ? `${line.slice(0, MAX_LENGTH - 1)}…` : line;

/**
 * The line of a failed step's output that says what went wrong: a TypeScript diagnostic, else the
 * deepest `Error: …` line, else the last line that isn't a stack frame or a wrapper's summary.
 */
export function pickError(output: string): string | undefined {
  const lines = plainText(output)
    .split('\n')
    .map((line) => line.replace(/^\S+Z \[[^\]]+\] /, '').trimEnd())
    .filter((line) => line.trim());

  const diagnostic = lines.find((line) => typeScriptDiagnostic.test(line));

  if (diagnostic) return cap(typeScriptDiagnostic.exec(diagnostic)![0]);

  const typeError = lines.findIndex((line) => nextTypeError.test(line));

  if (typeError !== -1) {
    const where = lines[typeError - 1]?.trim();

    return cap(`${where ? `${where}: ` : ''}${lines[typeError]}`);
  }

  const causes = lines
    .filter((line) => causedBy.test(line))
    .map((line) => line.replace(causedBy, '').trim());

  const errors = [...causes.reverse(), ...lines.map((line) => line.trim())].filter((line) =>
    errorLine.test(line),
  );

  if (errors.length) return cap(errors[0].replace(/^⨯\s*/, ''));

  const last = lines.filter((line) => !noise.some((pattern) => pattern.test(line))).at(-1);

  return last ? cap(last.trim()) : undefined;
}
