'use client';

import { createContext, useContext } from 'react';

export type CreateKeyData = {
  /** Values posted to `mint` as `data`. */
  data: Record<string, unknown>;
  setValue: (field: string, value: unknown) => void;
};

export const CreateKeyDataContext = createContext<CreateKeyData | null>(null);

/** Reads and sets the `data` the create dialog mints the key with, from a registered create field. */
export function useCreateKeyData(): CreateKeyData {
  const value = useContext(CreateKeyDataContext);

  if (!value) throw new Error('useCreateKeyData must be used inside the API key create dialog.');

  return value;
}
