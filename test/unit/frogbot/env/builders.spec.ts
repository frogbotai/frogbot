import { describe, expect, it } from 'vitest';

import { env } from '../../../../packages/frogbot/src/env/builders.js';

describe('env builders', () => {
  it('creates immutable descriptors', () => {
    const builder = env.string().name('API_URL').required();

    expect(Object.isFrozen(builder)).toBe(true);
    expect(builder).toMatchObject({ envName: 'API_URL', requiredMode: 'always' });
  });

  it('stores defaults', () => {
    expect(env.number().default(3000)).toMatchObject({ defaultValue: 3000, hasDefault: true });
  });

  it('stores conditional requiredness', () => {
    const predicate = () => true;

    expect(env.string().requiredWhen(predicate)).toMatchObject({
      requiredMode: 'conditional',
      requiredPredicate: predicate,
    });
  });

  it('rejects required and default combinations', () => {
    expect(() => env.string().required().default('value')).toThrow(
      'An env variable cannot be both required and defaulted',
    );
    expect(() => env.string().default('value').required()).toThrow(
      'An env variable cannot be both required and defaulted',
    );
  });

  it('rejects multiple required modifiers', () => {
    expect(() =>
      env
        .string()
        .required()
        .requiredWhen(() => true),
    ).toThrow('An env variable can only have one required modifier');
  });

  it('rejects invalid env variable names', () => {
    expect(() => env.string().name('api-url')).toThrow('Invalid env variable name: api-url');
  });

  it('parses custom values', () => {
    const builder = env.custom((raw) => JSON.parse(raw) as { enabled: boolean });

    expect(builder.parse('{"enabled":true}')).toEqual({
      success: true,
      value: { enabled: true },
    });
  });

  it('turns custom parser failures into parse failures', () => {
    const builder = env.custom(() => {
      throw new Error('invalid JSON');
    });

    expect(builder.parse('value')).toEqual({ error: 'invalid JSON', success: false });
  });
});
