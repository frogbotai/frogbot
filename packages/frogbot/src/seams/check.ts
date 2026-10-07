// Type-level checks for the seam converters. A converter casts only where a
// `Check<…>` beside it proves the shapes it relies on still line up, so a
// Payload upgrade that drifts fails `tsc` at the converter, not at runtime.

export type Extends<A, B> = [A] extends [B] ? true : false;

export type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type Check<T extends true> = T;
