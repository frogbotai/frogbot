import { inspect, types } from 'node:util';

import { isFrogBotError } from '../errors/FrogBotError.js';
import { toProblem } from '../errors/toProblem.js';

const prefix = '[frogbot]';
const maxCauses = 5;
const indent = '      ';
const framePattern = /^\s*at (?:async )?/;

function isInternalFrame(line: string): boolean {
  if (!framePattern.test(line)) return false;

  const location = /\(([^()]*)\)\s*$/.exec(line)?.[1] ?? line.replace(framePattern, '');

  return (
    location.startsWith('node:') ||
    location.includes('/node_modules/') ||
    location.includes('\\node_modules\\')
  );
}

function isError(value: unknown): value is Error {
  return types.isNativeError(value) || value instanceof Error;
}

function nextCause(value: unknown): unknown {
  try {
    return isError(value) ? (value.cause ?? undefined) : undefined;
  } catch {
    return undefined;
  }
}

function causeText(cause: unknown): string {
  try {
    if (isError(cause)) {
      return typeof cause.stack === 'string' && cause.stack !== ''
        ? cause.stack
        : `${cause.name}: ${cause.message}`;
    }

    return typeof cause === 'string' ? cause : inspect(cause);
  } catch {
    return inspect(cause);
  }
}

function formatCause(cause: unknown): string {
  const [first, ...rest] = causeText(cause).split('\n');
  const kept = rest.filter((line) => !isInternalFrame(line));
  const hidden = rest.length - kept.length;

  const continuation = kept.map((line) => (line.trim() === '' ? '' : indent + line.trimStart()));

  if (hidden > 0) {
    continuation.push(`${indent}(${hidden} internal ${hidden === 1 ? 'frame' : 'frames'} hidden)`);
  }

  return [`  Caused by: ${first}`, ...continuation].join('\n');
}

/**
 * The text `frogbot` prints for a failure: `[frogbot] <message>` and its causes. A `FrogBotError`
 * prints as `[frogbot] <code>: <detail>`, then `  Fix: <hint>` and `  Docs: <link>`.
 */
export function formatCliError(error: unknown, context?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const stripped = message.startsWith(prefix) ? message.slice(prefix.length).trimStart() : message;
  const problem = isFrogBotError(error) ? toProblem(error, { debug: true }) : undefined;
  const detail = problem ? `${problem.code}: ${stripped}` : stripped;
  const head = context ? `${prefix} ${context}: ${detail}` : `${prefix} ${detail}`;

  const blocks = [head];

  if (problem?.hint) blocks.push(`  Fix: ${problem.hint}`);
  if (problem) blocks.push(`  Docs: ${problem.type}`);
  const seen = new Set<unknown>([error]);
  let cause = nextCause(error);

  while (cause !== undefined) {
    if (blocks.length > maxCauses || seen.has(cause)) {
      blocks.push('  … more causes not shown');
      break;
    }

    seen.add(cause);
    blocks.push(formatCause(cause));
    cause = nextCause(cause);
  }

  return blocks.join('\n');
}
