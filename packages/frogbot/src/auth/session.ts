import {
  AuthenticationError,
  checkLoginPermission,
  commitTransaction,
  getFieldsToSign,
  initTransaction,
  jwtSign,
  type PayloadRequest,
  resetLoginAttempts,
  type TypedUser,
  UnverifiedEmail,
} from 'payload';
import { addSessionToUser } from 'payload/shared';

import type { FrogbotRequest } from '../types/request.js';
import {
  hasSessionTransaction,
  requireSessionTransaction,
  revokeIssuedSession,
  rollbackSessionTransaction,
  withSessionOperation,
} from './operation.js';

type SessionIssueArgs = {
  req: FrogbotRequest;
  collectionSlug: string;
  userId: string | number;
};

type SessionIssueResult = { user: TypedUser; token: string; exp: number };

export async function issueSession({
  req,
  collectionSlug,
  userId,
}: SessionIssueArgs): Promise<SessionIssueResult> {
  const payloadReq = req as unknown as PayloadRequest;
  const { payload } = payloadReq;
  const collectionConfig = payload.collections[collectionSlug]?.config;
  if (!collectionConfig?.auth) throw new AuthenticationError(payloadReq.t);

  const { auth, hooks } = collectionConfig;
  const dbReq = {
    ...payloadReq,
    transactionID: hasSessionTransaction({ req, collectionSlug })
      ? payloadReq.transactionID
      : undefined,
  };

  let sid: string | undefined;
  let writeAttempted = false;
  let subjectId = userId;

  const writeSessions = async ({
    sessions,
    signal,
  }: {
    sessions: unknown;
    signal: AbortSignal;
  }) => {
    signal.throwIfAborted();
    const shouldCommit = await initTransaction(dbReq);
    try {
      await requireSessionTransaction(dbReq);
      signal.throwIfAborted();
      writeAttempted = true;
      const result = await payload.db.updateOne({
        id: subjectId,
        collection: collectionSlug,
        data: { sessions, updatedAt: null },
        req: dbReq,
        returning: false,
      });
      signal.throwIfAborted();
      if (shouldCommit) await commitTransaction(dbReq);
      return result;
    } catch (error) {
      try {
        if (shouldCommit) await rollbackSessionTransaction(dbReq);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Session write rollback failed.');
      }
      throw error;
    }
  };
  const revoke = async (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!sid) return;
    await revokeIssuedSession({ req: payloadReq, collectionSlug, userId: subjectId, sid, signal });
    signal.throwIfAborted();
    sid = undefined;
  };

  return withSessionOperation({
    req,
    collectionSlug,
    fn: async ({ signal, cleanups }) => {
      cleanups.add(revoke);
      signal.throwIfAborted();

      const authoritative = await payload.db.findOne<TypedUser>({
        collection: collectionSlug,
        req: dbReq,
        where: {
          and: [
            { id: { equals: userId } },
            ...(collectionConfig.trash ? [{ deletedAt: { exists: false } }] : []),
          ],
        },
      });
      signal.throwIfAborted();
      if (!authoritative) throw new AuthenticationError(payloadReq.t);
      checkLoginPermission({ req: payloadReq, user: authoritative });
      if (auth.verify && authoritative._verified === false) {
        throw new UnverifiedEmail({ t: payloadReq.t });
      }

      subjectId = authoritative.id;
      const email = authoritative.email;
      if (typeof email !== 'string' || !email) throw new AuthenticationError(payloadReq.t);
      const identify = (user: TypedUser): TypedUser => ({
        ...user,
        id: subjectId,
        email,
        collection: collectionSlug,
        _strategy: 'local-jwt',
      });
      const sessionUser = {
        id: subjectId,
        sessions: structuredClone(authoritative.sessions ?? []),
      } as TypedUser;
      const previousSids = new Set(sessionUser.sessions?.map((session) => session.id));
      const sessionPayload = Object.create(payload) as typeof payload;
      sessionPayload.db = Object.create(payload.db) as typeof payload.db;
      sessionPayload.db.updateOne = ({ data }) =>
        writeSessions({ sessions: data.sessions, signal });

      try {
        await addSessionToUser({
          collectionConfig,
          payload: sessionPayload,
          req: dbReq,
          user: sessionUser,
        });
      } finally {
        if (writeAttempted) {
          sid = sessionUser.sessions?.find((session) => !previousSids.has(session.id))?.id;
        }
      }

      signal.throwIfAborted();

      if (auth.maxLoginAttempts > 0) {
        await resetLoginAttempts({
          collection: collectionConfig,
          doc: authoritative,
          payload,
          req: dbReq,
        });
        signal.throwIfAborted();
      }

      let user = identify({ ...authoritative, sessions: sessionUser.sessions });
      for (const hook of hooks.beforeLogin) {
        user = identify(
          (await hook({
            collection: collectionConfig,
            context: payloadReq.context,
            req: payloadReq,
            user,
          })) || user,
        );
        signal.throwIfAborted();
      }

      const fieldsToSign = getFieldsToSign({ collectionConfig, email, user, sid });
      fieldsToSign.id = subjectId;
      fieldsToSign.collection = collectionSlug;
      if (sid) fieldsToSign.sid = sid;
      else delete fieldsToSign.sid;
      const { token, exp } = await jwtSign({
        fieldsToSign,
        secret: payload.secret,
        tokenExpiration: auth.tokenExpiration,
      });
      signal.throwIfAborted();
      payloadReq.user = user;

      for (const hook of hooks.afterLogin) {
        user = identify(
          (await hook({
            collection: collectionConfig,
            context: payloadReq.context,
            req: payloadReq,
            token,
            user,
          })) || user,
        );
        signal.throwIfAborted();
        payloadReq.user = user;
      }

      for (const field of [
        'hash',
        'salt',
        'password',
        'resetPasswordToken',
        'resetPasswordExpiration',
        '_verificationToken',
        'sessions',
        'loginAttempts',
        'lockUntil',
      ]) {
        delete user[field];
      }

      payloadReq.user = user;
      return { user, token, exp };
    },
  });
}
