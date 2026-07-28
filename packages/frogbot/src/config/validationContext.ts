import { AsyncLocalStorage } from 'node:async_hooks';

export type ValidationMode = 'codegen' | 'runtime';

const storage = new AsyncLocalStorage<{ mode: ValidationMode }>();

export function getValidationMode(): ValidationMode {
  return storage.getStore()?.mode ?? 'runtime';
}

export function runWithValidationMode<T>({
  load,
  mode,
}: {
  load: () => Promise<T>;
  mode: ValidationMode;
}): Promise<T> {
  return storage.run({ mode }, load);
}
