import type { TypedUser } from '../types/generated.js';
import type { FrogBotRequest } from '../types/request.js';

/** The admin user with this email, for a channel's `identity`, or null. */
export async function findUserByEmail(
  req: FrogBotRequest,
  email: string,
): Promise<TypedUser | null> {
  const payloadConfig = await req.frogbot.config._internal.payloadConfig;
  const collection = payloadConfig.admin.user;
  const result = await req.frogbot.find({
    collection,
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
    req,
  });
  const match = result.docs[0];

  return match ? { ...match, collection } : null;
}
