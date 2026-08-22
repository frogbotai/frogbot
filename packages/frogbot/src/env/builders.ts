import { parseBoolean, parseEnum, parseNumber, parseString, type ParseResult } from './parse.js';

export type RequiredWhen<TValues = Record<string, unknown>> = (values: TValues) => boolean;

export type EnvBuilder<T, TResolved extends boolean = false> = Readonly<{
  default: (value: T) => EnvBuilder<T, true>;
  name: (name: string) => EnvBuilder<T, TResolved>;
  required: () => EnvBuilder<T, true>;
  requiredWhen: (predicate: RequiredWhen) => EnvBuilder<T, true>;
  _output: TResolved extends true ? T : T | undefined;
}>;

export type EnvBuilderOutput<TBuilder> =
  TBuilder extends EnvBuilder<infer T, infer TResolved>
    ? TResolved extends true
      ? T
      : T | undefined
    : never;

export type EnvBuilderDescriptor<T = unknown> = EnvBuilder<T, boolean> &
  Readonly<{
    defaultValue?: T;
    hasDefault: boolean;
    envName?: string;
    parse: (raw: string) => ParseResult<T>;
    requiredMode?: 'always' | 'conditional';
    requiredPredicate?: RequiredWhen;
  }>;

type BuilderState<T> = Pick<
  EnvBuilderDescriptor<T>,
  'defaultValue' | 'envName' | 'hasDefault' | 'parse' | 'requiredMode' | 'requiredPredicate'
>;

const envNamePattern = /^[A-Z_][A-Z0-9_]*$/;

const createBuilder = <T>(state: BuilderState<T>): EnvBuilder<T> => {
  const builder = {
    ...state,
    default(value) {
      if (state.requiredMode)
        throw new Error('An env variable cannot be both required and defaulted');
      return createBuilder({ ...state, defaultValue: value, hasDefault: true }) as EnvBuilder<
        T,
        true
      >;
    },
    name(name) {
      if (!envNamePattern.test(name)) throw new Error(`Invalid env variable name: ${name}`);
      return createBuilder({ ...state, envName: name });
    },
    required() {
      if (state.hasDefault)
        throw new Error('An env variable cannot be both required and defaulted');
      if (state.requiredMode)
        throw new Error('An env variable can only have one required modifier');
      return createBuilder({ ...state, requiredMode: 'always' }) as EnvBuilder<T, true>;
    },
    requiredWhen(predicate) {
      if (state.hasDefault)
        throw new Error('An env variable cannot be both required and defaulted');
      if (state.requiredMode)
        throw new Error('An env variable can only have one required modifier');
      return createBuilder({
        ...state,
        requiredMode: 'conditional',
        requiredPredicate: predicate,
      }) as EnvBuilder<T, true>;
    },
  } as unknown as EnvBuilderDescriptor<T>;

  return Object.freeze(builder);
};

const fromParser = <T>(parse: (raw: string) => ParseResult<T>): EnvBuilder<T> =>
  createBuilder({ hasDefault: false, parse });

export const env = Object.freeze({
  boolean: (): EnvBuilder<boolean> => fromParser(parseBoolean),
  custom: <T>(parse: (raw: string) => T): EnvBuilder<T> =>
    fromParser((raw) => {
      try {
        return { success: true, value: parse(raw) };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          success: false,
        };
      }
    }),
  enum: <const T extends readonly [string, ...string[]]>(values: T): EnvBuilder<T[number]> =>
    fromParser((raw) => parseEnum(values, raw)),
  number: (): EnvBuilder<number> => fromParser(parseNumber),
  string: (): EnvBuilder<string> => fromParser(parseString),
});
