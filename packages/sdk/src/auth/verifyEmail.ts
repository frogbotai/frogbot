import type { AuthCollectionSlug, FrogBotSDKSend, FrogBotTypesShape } from '../types.js';

export type VerifyEmailOptions<T extends FrogBotTypesShape, TSlug extends AuthCollectionSlug<T>> = {
  collection: TSlug;
  token: string;
};

export async function verifyEmail<T extends FrogBotTypesShape, TSlug extends AuthCollectionSlug<T>>(
  send: FrogBotSDKSend,
  options: VerifyEmailOptions<T, TSlug>,
  init?: RequestInit,
): Promise<{ message: string }> {
  const response = await send({
    init,
    method: 'POST',
    path: `/${options.collection}/verify/${options.token}`,
  });

  return response.json();
}
