import { isDeepStrictEqual } from 'node:util';

import type { z } from 'zod';

import { pieceFactoryDefinition, pieceInstanceRuntime } from './definePiece.js';
import type {
  PieceActionDefinition,
  PieceDefinition,
  PieceFactory,
  PieceInstance,
  PieceOption,
  PieceTriggerDefinition,
} from './types.js';

type ConformanceError = string | RegExp;
type ConformanceExpectation = { result: unknown } | { error: ConformanceError };

type ConformanceAction = {
  slug: string;
  input: unknown;
  expect: ConformanceExpectation;
};

type ConformanceOptions = {
  action: string;
  field: string;
  input?: Record<string, unknown>;
  expect: PieceOption[];
};

type ConformanceTrigger = {
  slug: string;
  type: PieceTriggerDefinition['type'];
};

export type PieceConformanceFixtures = {
  factoryOptions?: Record<string, unknown>;
  actions: ConformanceAction[];
  options?: ConformanceOptions[];
  triggers?: ConformanceTrigger[];
  oauth?: boolean;
};

function fail(message: string): never {
  throw new Error(`[frogbot] Piece conformance: ${message}`);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (!isDeepStrictEqual(actual, expected)) fail(message);
}

function assertUnique(slugs: string[], subject: string): void {
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) fail(`${subject} contains duplicate '${slug}'.`);
    seen.add(slug);
  }
}

function matchesError(error: unknown, expected: ConformanceError): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return typeof expected === 'string' ? message.includes(expected) : expected.test(message);
}

export async function pieceConformance<T extends PieceDefinition>(
  createPiece: PieceFactory<T>,
  fixtures: PieceConformanceFixtures,
): Promise<void> {
  const definition = pieceFactoryDefinition(createPiece);
  const actionSlugs = definition.actions.map(({ slug }) => slug);
  const fixtureSlugs = fixtures.actions.map(({ slug }) => slug);
  assertUnique(fixtureSlugs, 'Action fixtures');
  assertEqual(
    [...fixtureSlugs].sort(),
    [...actionSlugs].sort(),
    `action fixtures must cover exactly: ${actionSlugs.join(', ')}.`,
  );

  const factoryOptions = fixtures.factoryOptions ?? {};
  let instance: PieceInstance & Record<string, unknown>;
  try {
    const runtimeFactory = createPiece as (options: Record<string, unknown>) => typeof instance;
    instance = runtimeFactory(factoryOptions);
  } catch (error) {
    fail(`factory options are invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  const configuredAuth = pieceInstanceRuntime(instance).auth;
  const req = {
    frogbot: {
      connections: {
        resolvePieceCredential: async () => ({ auth: configuredAuth, key: instance }),
      },
    },
    user: null,
  } as never;

  for (const fixture of fixtures.actions) {
    const action = instance[fixture.slug as keyof typeof instance];
    if (typeof action !== 'function') fail(`action '${fixture.slug}' is not callable.`);
    try {
      const result = await (action as (args: { input: unknown; req: never }) => Promise<unknown>)({
        input: fixture.input,
        req,
      });
      if ('error' in fixture.expect) {
        fail(
          `action '${fixture.slug}' resolved but expected error ${String(fixture.expect.error)}.`,
        );
      }
      assertEqual(
        result,
        fixture.expect.result,
        `action '${fixture.slug}' returned an unexpected result.`,
      );
    } catch (error) {
      if ('error' in fixture.expect && matchesError(error, fixture.expect.error)) continue;
      if ('error' in fixture.expect) {
        fail(
          `action '${fixture.slug}' threw '${error instanceof Error ? error.message : String(error)}', expected ${String(fixture.expect.error)}.`,
        );
      }
      throw error;
    }
  }

  const parsedOptions = definition.options
    ? definition.options.parse(
        Object.fromEntries(
          Object.entries(factoryOptions).filter(
            ([key]) => !['auth', 'oauth', 'slug'].includes(key),
          ),
        ),
      )
    : {};
  const client = await instance.client({ req });
  for (const fixture of fixtures.options ?? []) {
    const action = definition.actions.find(({ slug }) => slug === fixture.action) as
      PieceActionDefinition<z.ZodType, z.ZodType | undefined, unknown, unknown> | undefined;
    if (!action) fail(`options fixture references unknown action '${fixture.action}'.`);
    const callbacks = action.options as
      | Record<
          string,
          (args: {
            input: Record<string, unknown>;
            client: unknown;
            options: unknown;
            req: never;
          }) => Promise<PieceOption[]>
        >
      | undefined;
    const callback = callbacks?.[fixture.field];
    if (!callback) {
      fail(`action '${fixture.action}' has no options callback for '${fixture.field}'.`);
    }
    const result = await callback({
      input: fixture.input ?? {},
      client,
      options: parsedOptions,
      req,
    });
    assertEqual(
      result,
      fixture.expect,
      `action '${fixture.action}' options '${fixture.field}' returned unexpected choices.`,
    );
  }

  const declaredTriggers = (definition.triggers ?? []).map(({ slug, type }) => ({ slug, type }));
  assertUnique(
    (fixtures.triggers ?? []).map(({ slug }) => slug),
    'Trigger fixtures',
  );
  assertEqual(
    fixtures.triggers ?? [],
    declaredTriggers,
    `trigger fixtures must match declarations: ${declaredTriggers.map(({ slug, type }) => `${slug} (${type})`).join(', ')}.`,
  );

  const declaresOAuth = Boolean(definition.oauth);
  if ((fixtures.oauth ?? false) !== declaresOAuth) {
    fail(`OAuth declaration expected ${fixtures.oauth ?? false}, received ${declaresOAuth}.`);
  }
}
