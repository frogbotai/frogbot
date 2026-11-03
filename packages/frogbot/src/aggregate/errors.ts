import { APIError } from 'payload';

export function describeAggregate(collection: string): string {
  return `Aggregate on collection '${collection}'`;
}

export class AggregateValidationError extends APIError {
  name = 'AggregateValidationError';

  constructor(message: string) {
    super(message, 400);
  }
}

export class AggregateCapabilityError extends APIError {
  name = 'AggregateCapabilityError';

  constructor(collection: string) {
    super(
      `[frogbot] ${describeAggregate(collection)}: the database adapter has no aggregate implementation.`,
      501,
    );
  }
}
