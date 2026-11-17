import type { Access } from 'frogbot';

/** Read, update and delete: the signed-in user's own notifications only. */
export function ownAccess(userSlug: string): Access {
  return ({ req }) =>
    req.user?.collection === userSlug ? { user: { equals: req.user.id } } : false;
}

/** Create: nobody through the API. `notify()` writes from trusted server code. */
export const createAccess: Access = () => false;
