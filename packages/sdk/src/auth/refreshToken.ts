import type {
  AuthCollectionSlug,
  DataFromAuthSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
} from '../types.js';

export type RefreshOptions<T extends FrogBotTypesShape, TSlug extends AuthCollectionSlug<T>> = {
  collection: TSlug;
};

export type RefreshResult<T extends FrogBotTypesShape, TSlug extends AuthCollectionSlug<T>> = {
  exp: number;
  refreshedToken: string;
  setCookie?: boolean;
  strategy?: string;
  user: DataFromAuthSlug<T, TSlug>;
};

export async function refreshToken<
  T extends FrogBotTypesShape,
  TSlug extends AuthCollectionSlug<T>,
>(
  send: FrogBotSDKSend,
  options: RefreshOptions<T, TSlug>,
  init?: RequestInit,
): Promise<RefreshResult<T, TSlug>> {
  const response = await send({
    init,
    method: 'POST',
    path: `/${options.collection}/refresh-token`,
  });

  return response.json();
}
