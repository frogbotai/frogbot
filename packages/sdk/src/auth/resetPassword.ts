import type {
  AuthCollectionSlug,
  DataFromAuthSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
} from '../types.js';

export type ResetPasswordOptions<
  T extends FrogBotTypesShape,
  TSlug extends AuthCollectionSlug<T>,
> = {
  collection: TSlug;
  data: {
    password: string;
    token: string;
  };
};

export type ResetPasswordResult<
  T extends FrogBotTypesShape,
  TSlug extends AuthCollectionSlug<T>,
> = {
  token?: string;
  user: DataFromAuthSlug<T, TSlug>;
};

export async function resetPassword<
  T extends FrogBotTypesShape,
  TSlug extends AuthCollectionSlug<T>,
>(
  send: FrogBotSDKSend,
  options: ResetPasswordOptions<T, TSlug>,
  init?: RequestInit,
): Promise<ResetPasswordResult<T, TSlug>> {
  const response = await send({
    init,
    json: options.data,
    method: 'POST',
    path: `/${options.collection}/reset-password`,
  });

  return response.json();
}
