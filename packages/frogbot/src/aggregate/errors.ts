import { frogbotError } from '../errors/catalog.js';
import type { FrogBotError } from '../errors/FrogBotError.js';

export function describeAggregate(collection: string): string {
  return `Aggregate on collection '${collection}'`;
}

/** An aggregate query the caller can fix: `aggregate.invalid`, 400. */
export function aggregateInvalid(detail: string): FrogBotError {
  return frogbotError('aggregate.invalid', detail);
}

/** A database adapter without aggregate support: `aggregate.unsupported`, 501. */
export function aggregateUnsupported(collection: string): FrogBotError {
  return frogbotError('aggregate.unsupported', {
    detail: `${describeAggregate(collection)}: the database adapter has no aggregate implementation.`,
    data: { collection },
  });
}
