import type { PayloadRequest } from 'payload';
import { getDataLoader, isolateObjectProperty } from 'payload';

export type RelationshipID = number | string;

export type ResolveRelationshipArgs = {
  /** The request to look up and create as. Its user's access applies. */
  req: PayloadRequest;
  /** The related collection's slug. */
  collection: string;
  /** The field on the related collection to match, such as `name`, `email` or `id`. */
  field: string;
  /** The value to match exactly. */
  value: unknown;
  /** Create the related record, with `field` set to `value`, when none matches. */
  createMissing?: boolean;
};

/** Thrown when a related record can't be linked: no match, several matches or a failed create. */
export class ImportLookupError extends Error {
  override name = 'ImportLookupError';
}

const lookups = new WeakMap<PayloadRequest, Map<string, Promise<RelationshipID | undefined>>>();

const textFieldTypes = new Set(['email', 'text', 'textarea']);

/**
 * Finds the record in `collection` whose `field` equals `value`, as the request's user, and
 * returns its ID. With `createMissing`, a missing record is created once per value per request.
 * Throws an `ImportLookupError` when nothing matches, several records match or the create fails.
 */
export async function resolveRelationship(args: ResolveRelationshipArgs): Promise<RelationshipID> {
  const found = await findRelationship(args);

  if (found !== undefined) return found;

  if (!args.createMissing) throw new ImportLookupError(missingMessage(args));

  const created = await cached(args, 'create', () => createRelationship(args));

  void remember(args, 'find', Promise.resolve(created));

  return created!;
}

/** Resolves `value` without writing: `linked`, or `will create` when `createMissing` would create it. */
export async function previewRelationship(
  args: ResolveRelationshipArgs,
): Promise<'linked' | 'will create'> {
  if ((await findRelationship(args)) !== undefined) return 'linked';

  if (!args.createMissing) throw new ImportLookupError(missingMessage(args));

  return 'will create';
}

function findRelationship(args: ResolveRelationshipArgs): Promise<RelationshipID | undefined> {
  return cached(args, 'find', async () => {
    const { req, collection, field } = args;

    const found = await req.payload.find({
      collection,
      depth: 0,
      limit: 2,
      overrideAccess: false,
      req: isolate(req),
      where: { [field]: { equals: queryValue(args) } },
    });

    if (found.totalDocs > 1) {
      throw new ImportLookupError(
        `${found.totalDocs} ${collection} records with ${describe(args)}`,
      );
    }

    return found.docs[0]?.id;
  });
}

async function createRelationship(args: ResolveRelationshipArgs): Promise<RelationshipID> {
  const { req, collection, field } = args;

  try {
    const created = await req.payload.create({
      collection,
      data: { [field]: queryValue(args) },
      depth: 0,
      overrideAccess: false,
      req: isolate(req),
    });

    return created.id;
  } catch (error) {
    throw new ImportLookupError(
      `could not create ${collection} record with ${describe(args)}: ${errorMessage(error)}`,
    );
  }
}

type LookupStep = 'create' | 'find';

function cached(
  args: ResolveRelationshipArgs,
  step: LookupStep,
  run: () => Promise<RelationshipID | undefined>,
): Promise<RelationshipID | undefined> {
  const known = results(args.req).get(lookupKey(args, step));

  return known ?? remember(args, step, run());
}

function remember(
  args: ResolveRelationshipArgs,
  step: LookupStep,
  result: Promise<RelationshipID | undefined>,
): Promise<RelationshipID | undefined> {
  results(args.req).set(lookupKey(args, step), result);

  return result;
}

function results(req: PayloadRequest): Map<string, Promise<RelationshipID | undefined>> {
  const known = lookups.get(req) ?? new Map<string, Promise<RelationshipID | undefined>>();

  lookups.set(req, known);

  return known;
}

function lookupKey(args: ResolveRelationshipArgs, step: LookupStep): string {
  return JSON.stringify([step, args.collection, args.field, queryValue(args)]);
}

function queryValue({ req, collection, field, value }: ResolveRelationshipArgs): unknown {
  const config = req.payload.collections[collection]?.config;

  if (!config) throw new ImportLookupError(`unknown collection "${collection}"`);

  const target = config.flattenedFields.find(({ name }) => name === field);

  return typeof value === 'number' && target && textFieldTypes.has(target.type)
    ? String(value)
    : value;
}

function isolate(req: PayloadRequest): PayloadRequest {
  const isolated = isolateObjectProperty(req, ['payloadDataLoader', 'transactionID']);

  isolated.transactionID = undefined;
  isolated.payloadDataLoader = getDataLoader(isolated);

  return isolated;
}

function missingMessage(args: ResolveRelationshipArgs): string {
  return `no ${args.collection} record with ${describe(args)}`;
}

function describe({ field, value }: ResolveRelationshipArgs): string {
  return `${field} "${String(value)}"`;
}

function errorMessage(error: unknown): string {
  const details = (error as { data?: { errors?: { message?: unknown }[] } }).data?.errors
    ?.map(({ message }) => message)
    .filter((message): message is string => typeof message === 'string');

  if (details?.length) return details.join('; ');

  return error instanceof Error ? error.message : String(error);
}
