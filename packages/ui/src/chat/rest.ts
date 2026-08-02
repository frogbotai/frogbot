import type { FrogBotSDK } from '@frogbotai/sdk'

export type PayloadPage<T> = {
  docs: T[]
  page: number
  totalDocs: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export async function chatRequest<T>(sdk: FrogBotSDK, path: string, init?: RequestInit): Promise<T> {
  const response = await sdk.request(path, init)
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}
