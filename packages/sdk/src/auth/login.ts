import type {
  AuthCollectionSlug,
  DataFromAuthSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
} from '../types.js';

export type LoginOptions<T extends FrogBotTypesShape, TSlug extends AuthCollectionSlug<T>> = {
  collection: TSlug;
  data: {
    email: string;
    password: string;
  };
};

export type LoginResult<T extends FrogBotTypesShape, TSlug extends AuthCollectionSlug<T>> = {
  exp?: number;
  message: string;
  token?: string;
  user: DataFromAuthSlug<T, TSlug>;
};

export async function login<T extends FrogBotTypesShape, TSlug extends AuthCollectionSlug<T>>(
  send: FrogBotSDKSend,
  options: LoginOptions<T, TSlug>,
  init?: RequestInit,
): Promise<LoginResult<T, TSlug>> {
  const response = await send({
    init,
    json: options.data,
    method: 'POST',
    path: `/${options.collection}/login`,
  });

  return response.json();
}
