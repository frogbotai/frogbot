import { APIError } from 'payload';

export function isReservedWaitpointKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

export function copyResumeData(data: unknown): unknown {
  const ancestors = new Set<object>();

  const invalid = () => {
    throw new APIError('FrogBot resume data must be a JSON value.', 400);
  };

  const validate = (value: unknown): void => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;

    if (typeof value === 'number' && Number.isFinite(value)) return;

    if (typeof value !== 'object' || !value) return invalid();

    if (ancestors.has(value)) return invalid();

    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);

    if (array && prototype !== Array.prototype) return invalid();

    if (!array && prototype !== Object.prototype && prototype !== null) return invalid();

    ancestors.add(value);

    if (array && Object.keys(value).length !== value.length) return invalid();

    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;

      if (typeof key !== 'string') return invalid();

      if (isReservedWaitpointKey(key)) {
        throw new APIError(`FrogBot resume data cannot contain the reserved key '${key}'.`, 400);
      }

      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) return invalid();

      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (!descriptor?.enumerable || !('value' in descriptor)) return invalid();

      validate(descriptor.value);
    }

    ancestors.delete(value);
  };

  validate(data);

  return JSON.parse(JSON.stringify(data));
}
