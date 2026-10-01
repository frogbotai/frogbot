import type { AuthCollectionSlug, FrogBotSDKSend, FrogBotTypesShape } from '../types.js';

export type ForgotPasswordOptions<
  T extends FrogBotTypesShape,
  TSlug extends AuthCollectionSlug<T>,
> = {
  collection: TSlug;
  data: {
    email: string;
  };
};

export async function forgotPassword<
  T extends FrogBotTypesShape,
  TSlug extends AuthCollectionSlug<T>,
>(
  send: FrogBotSDKSend,
  options: ForgotPasswordOptions<T, TSlug>,
  init?: RequestInit,
): Promise<{ message: string }> {
  const response = await send({
    init,
    json: options.data,
    method: 'POST',
    path: `/${options.collection}/forgot-password`,
  });

  return response.json();
}
