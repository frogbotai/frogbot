import { type AuthStrategy, JWTAuthentication, type Payload } from 'payload';
import { extractJWT } from 'payload/shared';

export const signInStrategyName = (collectionSlug: string) => `${collectionSlug}-sign-in`;

function tokenCollection(token: string): unknown {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()).collection;
  } catch {
    return undefined;
  }
}

/**
 * Payload registers its cookie strategy only for collections with the local strategy on, so a
 * sign-in collection with `disableLocalStrategy` gets this one. It runs Payload's own JWT check
 * against a view of the collection with the local strategy on, so verification, sessions and
 * the cookie's CSRF rules stay Payload's.
 */
export function buildSignInStrategy(collectionSlug: string): AuthStrategy {
  return {
    name: signInStrategyName(collectionSlug),
    authenticate: (args) => {
      const { payload } = args;
      const token = extractJWT(args);
      const collection = payload.collections[collectionSlug];
      if (!token || !collection || tokenCollection(token) !== collectionSlug) {
        return { user: null };
      }

      const view = Object.create(payload) as Payload;

      view.collections = {
        ...payload.collections,
        [collectionSlug]: {
          ...collection,
          config: {
            ...collection.config,
            auth: { ...collection.config.auth, disableLocalStrategy: false },
          },
        },
      };

      const headers = new Headers(args.headers);
      headers.set('DisableAutologin', 'true');

      return JWTAuthentication({ ...args, headers, payload: view });
    },
  };
}
