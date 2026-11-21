import type { FrogBotRequest, Where } from 'frogbot';
import { APIError } from 'frogbot';
import { toPayloadRequest } from 'frogbot/internal';

import { forgetTenants, relationID, tenancyOptions } from '../access.js';
import type { TenancyResolvedOptions } from '../types.js';
import { tenantNoun } from './utilities.js';

const isWriteConflict = (error: unknown) =>
  (error as { code?: unknown } | null)?.code === 112 ||
  (error as { hasErrorLabel?: (label: string) => boolean } | null)?.hasErrorLabel?.(
    'TransientTransactionError',
  ) === true;

/** The `req.context` flag an app sets while it deletes a whole tenant, so its Owner row can go too. */
export const deletingTenant = 'tenancyDeletingTenant';

/** The `req.context` flag `handOverTenant` sets while it swaps the two rows, the one change that moves `owner`. */
export const handingOver = 'tenancyHandingOver';

export const ownerMessages = {
  onlyByHandover: (noun: string, handover?: string) =>
    `Nobody is made the Owner of a ${noun} by an invite or a role change. The Owner hands it over ${handover ? `with ${handover}` : 'instead'}.`,
  lastMember: (noun: string) =>
    `Nobody else here has signed in to take it over. Delete the ${noun} instead of leaving it.`,
  handOverFirst: (noun: string) =>
    `The Owner stays in the ${noun} until they hand it over to another member.`,
  ownerOnly: (noun: string) => `Only the ${noun}'s Owner can change or remove the Owner.`,
  exactlyOne: (noun: string) => `A ${noun} has exactly one Owner.`,
};

/**
 * Writes to the tenant inside the request's transaction, so two changes to its members at once conflict instead of
 * each reading the other's rows from its snapshot. The later one starts its transaction over, then sees the first;
 * call it before writing anything, so starting over loses nothing.
 */
export async function lockTenant(
  req: FrogBotRequest,
  tenant: unknown,
  tenantsSlug: string,
): Promise<void> {
  const id = relationID(tenant);
  if (!id) return;

  for (let attempt = 1; ; attempt += 1) {
    const transaction = req.transactionID;
    if (!transaction) return;
    try {
      await req.frogbot.db.updateOne({
        collection: tenantsSlug,
        id,
        data: { updatedAt: new Date().toISOString() },
        returning: false,
        req: toPayloadRequest(req),
      });

      return;
    } catch (error) {
      if (attempt === 20 || !isWriteConflict(error)) throw error;
      await req.frogbot.db.rollbackTransaction(transaction);
      const restarted = await req.frogbot.db.beginTransaction();
      if (!restarted) throw error;
      req.transactionID = restarted;
      await new Promise((resolve) => setTimeout(resolve, attempt * 10));
    }
  }
}

/** Throws unless the tenant has exactly one Owner who can sign in. */
export async function keepOneOwner(
  req: FrogBotRequest,
  tenant: unknown,
  { membersSlug, tenantField }: TenancyResolvedOptions,
  noun: string,
): Promise<void> {
  const owners: Where = {
    [tenantField]: { equals: relationID(tenant) },
    role: { equals: 'owner' },
    user: { exists: true },
  };

  const { totalDocs } = await req.frogbot.count({
    collection: membersSlug,
    where: owners,
    overrideAccess: true,
    req,
  });

  if (totalDocs !== 1) throw new APIError(ownerMessages.exactlyOne(noun), 409, undefined, true);
}

async function inTransaction<T>(req: FrogBotRequest, fn: () => Promise<T>): Promise<T> {
  if (req.transactionID) return fn();
  const db = req.frogbot.db;
  const started = await db.beginTransaction();
  if (!started) return fn();
  req.transactionID = started;
  try {
    const result = await fn();
    await db.commitTransaction(req.transactionID);

    return result;
  } catch (error) {
    if (req.transactionID) await db.rollbackTransaction(req.transactionID);
    throw error;
  } finally {
    delete req.transactionID;
  }
}

export type HandOverResult =
  | { done: true; from: string; to: string }
  | { done: false; status: 400 | 403 | 404; message: string };

/**
 * Makes the member `to` the tenant's Owner and its Owner an admin, in one transaction under the tenant's lock, so of
 * two handovers at once one wins and the other is checked again against the new Owner. `by: 'owner'` lets only the
 * signed-in Owner do it; `by: 'superUser'` lets the caller, already checked, hand over any tenant's ownership.
 *
 * @example
 * const result = await handOverTenant(req, { tenant: workspace.id, to: memberID, by: 'owner' });
 */
export function handOverTenant(
  req: FrogBotRequest,
  { tenant, to, by }: { tenant: unknown; to: unknown; by: 'owner' | 'superUser' },
): Promise<HandOverResult> {
  const options = tenancyOptions();
  const { membersSlug, tenantField, tenantsSlug } = options;
  const tenantID = relationID(tenant);
  const targetID = relationID(to);

  return inTransaction(req, async () => {
    if (!tenantID || !targetID) return { done: false, status: 404, message: 'Member not found.' };
    await lockTenant(req, tenantID, tenantsSlug);

    const { docs } = await req.frogbot.find({
      collection: membersSlug,
      where: { [tenantField]: { equals: tenantID } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    });

    const rows = docs.map((doc): Record<string, unknown> => ({ ...doc }));
    const owner = rows.find(({ role }) => role === 'owner');
    const target = rows.find(({ id }) => relationID(id) === targetID);

    if (by === 'owner' && relationID(owner?.user) !== relationID(req.user?.id)) {
      return {
        done: false,
        status: 403,
        message: 'Only the Owner can hand over ownership.',
      };
    }

    if (!target) return { done: false, status: 404, message: 'Member not found.' };
    if (target === owner) {
      return {
        done: false,
        status: 400,
        message: 'Choose another member to hand ownership to.',
      };
    }

    if (!relationID(target.user)) {
      return {
        done: false,
        status: 400,
        message: `${String(target.email)} hasn't signed in yet. Hand ownership to someone who has.`,
      };
    }

    req.context[handingOver] = true;
    try {
      await req.frogbot.update({
        collection: membersSlug,
        id: targetID,
        data: { role: 'owner' },
        overrideAccess: true,
        req,
      });

      if (owner) {
        await req.frogbot.update({
          collection: membersSlug,
          id: relationID(owner.id)!,
          data: { role: 'admin' },
          overrideAccess: true,
          req,
        });
      }
    } finally {
      delete req.context[handingOver];
    }

    await keepOneOwner(req, tenantID, options, tenantNoun(options));
    forgetTenants(req);

    return {
      done: true,
      from: relationID(owner?.id) ?? '',
      to: targetID,
    };
  });
}
