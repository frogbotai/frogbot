import type { FrogBotRequest } from 'frogbot';
import { toPayloadRequest } from 'frogbot/internal';
import { commitTransaction, initTransaction, killTransaction, type PayloadRequest } from 'payload';

/** The two-factor fields the plugin reads from a user, as stored. */
export type TwoFactorUser = {
  id: string | number;
  email?: string | null;
  twoFactorEnabled?: boolean | null;
  twoFactorSecret?: string | null;
  twoFactorRecovery?: string[] | null;
  twoFactorLastStep?: number | null;
  sessions?: { id: string }[] | null;
  [key: string]: unknown;
};

/** Arguments for `require` and `canEnable`. */
export type TwoFactorUserArgs = { req: FrogBotRequest; user: TwoFactorUser };

/** The events the plugin emails the user about. */
export type TwoFactorEmailEvent =
  'enabled' | 'disabled' | 'recoveryCodeUsed' | 'recoveryCodesCreated' | 'reset';

/** Builds one event's email. */
export type TwoFactorEmail = (
  args: TwoFactorUserArgs,
) =>
  | { subject: string; text: string; html?: string }
  | Promise<{ subject: string; text: string; html?: string }>;

/** Options for `twoFactor()`. */
export type TwoFactorPluginOptions = {
  /** The auth collection that gets two-factor sign-in. Defaults to `admin.user`. */
  collection?: string;
  /** Returns true for users who must have two-factor sign-in: they set it up at their next sign-in and can't turn it off. */
  require?: (args: TwoFactorUserArgs) => boolean | Promise<boolean>;
  /** Returns false for users who may not turn two-factor sign-in on (403). Defaults to everyone. */
  canEnable?: (args: TwoFactorUserArgs) => boolean | Promise<boolean>;
  /** Returns true when the signed-in user may reset `user`'s two-factor sign-in. Asked only for a user they can read and update. Defaults to nobody. */
  canReset?: (args: TwoFactorUserArgs) => boolean | Promise<boolean>;
  /** The name authenticator apps show beside the account. Defaults to `FrogBot`. */
  issuer?: string;
  /** Replaces an event's email, or turns it off with `false`. */
  emails?: Partial<Record<TwoFactorEmailEvent, TwoFactorEmail | false>>;
};

/** `twoFactor` options with defaults filled, read by other plugins through `plugins['plugin-two-factor']`. */
export type TwoFactorResolvedOptions = Omit<
  Required<TwoFactorPluginOptions>,
  'collection' | 'emails'
> & {
  collection?: string;
  emails: NonNullable<TwoFactorPluginOptions['emails']>;
};

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-two-factor': TwoFactorResolvedOptions;
  }
}

declare module 'payload' {
  interface RequestContext {
    /** Set by the two-factor plugin's `beforeOperation` hook on a password reset, so its `beforeLogin` gate lets the reset save the password. */
    twoFactorReset?: boolean;
    /** Set by the two-factor plugin's `first-register` endpoint, so its `beforeLogin` gate lets the first user's registration finish. */
    twoFactorFirstUser?: boolean;
    /** Set by the two-factor plugin just before it finishes a sign-in that passed the code or setup step, to `passedKey` of that user. */
    twoFactorPassed?: string;
  }
}

export type TwoFactorContext = { slug: string; options: TwoFactorResolvedOptions };

export const FIELDS = {
  enabled: 'twoFactorEnabled',
  secret: 'twoFactorSecret',
  recovery: 'twoFactorRecovery',
  lastStep: 'twoFactorLastStep',
} as const;

/** The field values of a user with two-factor sign-in off. */
export const CLEARED = {
  [FIELDS.enabled]: false,
  [FIELDS.secret]: null,
  [FIELDS.recovery]: null,
  [FIELDS.lastStep]: null,
};

/** The `req.context.twoFactorPassed` value that lets one user's sign-in past the `beforeLogin` gate. */
export const passedKey = (slug: string, id: string | number) => JSON.stringify([slug, String(id)]);

export const WRONG_CODE = "That code didn't work.";

export const TEN_MINUTES = 10 * 60 * 1000;

/** True when the user has two-factor sign-in on. */
export function hasTwoFactor(user: unknown): boolean {
  return (
    typeof user === 'object' &&
    user !== null &&
    (user as Record<string, unknown>)[FIELDS.enabled] === true
  );
}

export const payloadRequest = (req: FrogBotRequest): PayloadRequest => toPayloadRequest(req);

export function routes(req: FrogBotRequest, slug: string) {
  const { config } = payloadRequest(req).payload;
  const api = config.routes.api.replace(/\/+$/, '');
  const base = `${api}/${slug}/two-factor`;
  const origin = config.serverURL || new URL(req.url!).origin;

  return {
    base,
    origin,
    admin: config.routes.admin,
    secure: new URL(origin).protocol === 'https:',
    cookiePrefix: config.cookiePrefix || 'payload',
  };
}

export async function readUser(
  req: FrogBotRequest,
  slug: string,
  id: string | number,
): Promise<TwoFactorUser | null> {
  const payloadReq = payloadRequest(req);

  return payloadReq.payload.db.findOne<TwoFactorUser>({
    collection: slug,
    req: payloadReq,
    where: { id: { equals: id } },
  });
}

/**
 * Writes two-factor fields with `db.updateOne` in one transaction and, when asked, ends every
 * session of the user or every one but `keep`, as logout with `allSessions` does.
 */
export async function writeUser({
  req,
  slug,
  id,
  data,
  sessions,
  keep,
}: {
  req: FrogBotRequest;
  slug: string;
  id: string | number;
  data: Record<string, unknown>;
  sessions?: 'all' | 'others';
  keep?: string;
}): Promise<void> {
  const payloadReq = payloadRequest(req);
  const { payload } = payloadReq;
  const useSessions = Boolean(payload.collections[slug]?.config.auth?.useSessions);
  const shouldCommit = await initTransaction(payloadReq);

  try {
    let next: Record<string, unknown> = { ...data };

    if (sessions && useSessions) {
      const user = await payload.db.findOne<TwoFactorUser>({
        collection: slug,
        req: payloadReq,
        where: { id: { equals: id } },
      });

      if (user) {
        next = {
          ...user,
          ...data,
          sessions:
            sessions === 'all'
              ? []
              : (user.sessions ?? []).filter((session) => session.id === keep),
          updatedAt: null,
        };
      }
    }

    if (Object.keys(next).length) {
      await payload.db.updateOne({
        id,
        collection: slug,
        data: next,
        req: payloadReq,
        returning: false,
      });
    }

    if (shouldCommit) await commitTransaction(payloadReq);
  } catch (error) {
    await killTransaction(payloadReq);
    throw error;
  }
}

/** `value` as a path on `origin`, or `null` when it points anywhere else. */
export function safeReturnTo(value: string, origin: string): string | null {
  if (!value.startsWith('/') || value !== value.trim() || /[\\\p{Cc}]/u.test(value)) return null;

  const url = new URL(value, origin);

  return url.origin === new URL(origin).origin && !url.pathname.startsWith('//')
    ? `${url.pathname}${url.search}${url.hash}`
    : null;
}

/** Reads a JSON or URL-encoded body. `form` is true for the browser's own form posts. */
export async function readBody(
  req: FrogBotRequest,
): Promise<{ body: Record<string, unknown>; form: boolean }> {
  const type = (req.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();

  try {
    if (type === 'application/json') {
      const body: unknown = JSON.parse((await req.text?.()) || '{}');

      return {
        body: typeof body === 'object' && body ? (body as Record<string, unknown>) : {},
        form: false,
      };
    }

    if (type === 'application/x-www-form-urlencoded') {
      return {
        body: Object.fromEntries(new URLSearchParams((await req.text?.()) ?? '')),
        form: true,
      };
    }
  } catch {
    return { body: {}, form: type !== 'application/json' };
  }

  return { body: {}, form: false };
}

export const jsonError = (message: string, status: number, headers?: HeadersInit) =>
  Response.json({ errors: [{ message }] }, { status, headers: noStore(headers) });

export function noStore(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  headers.set('cache-control', 'no-store');

  return headers;
}
