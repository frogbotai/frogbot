import { defineConfig } from '../../../../packages/gateway/src/config/schema.js';
import type {
  ProviderConfigMap,
  ProvidersInput,
} from '../../../../packages/gateway/src/providers/registry.js';

/** An isolated env for code that takes `env` as a parameter; nothing under test reads `NODE_ENV`. */
export function testEnv(vars: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: 'test', ...vars };
}

/** A provider map checked per key like an authored config, typed as the runtime map. */
export function providerMap<const P extends ProvidersInput<P>>(providers: P): ProviderConfigMap {
  return defineConfig({ providers }).providers;
}
