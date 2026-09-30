import type {
  AuthCollectionSlug,
  DataFromAuthSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
} from '../types.js';

export type MeOptions<T extends FrogBotTypesShape, TSlug extends AuthCollectionSlug<T>> = {
  collection: TSlug;
};

export type MeResult<T extends FrogBotTypesShape, TSlug extends AuthCollectionSlug<T>> = {
  collection?: TSlug;
  exp?: number;
  message: string;
  strategy?: string;
  token?: string;
  user: DataFromAuthSlug<T, TSlug>;
};

export async function me<T extends FrogBotTypesShape, TSlug extends AuthCollectionSlug<T>>(
  send: FrogBotSDKSend,
  options: MeOptions<T, TSlug>,
  init?: RequestInit,
): Promise<MeResult<T, TSlug>> {
  const response = await send({
    init,
    method: 'GET',
    path: `/${options.collection}/me`,
  });

  return response.json();
}
