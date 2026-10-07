export type Extends<A, B> = [A] extends [B] ? true : false;

export type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type Check<T extends true> = T;
