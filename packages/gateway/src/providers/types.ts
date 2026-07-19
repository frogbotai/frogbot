// Shared contract every provider definition must satisfy.
//
// A provider definition is a static, stateless description: a name literal,
// the env vars it consumes, a pure `fromEnv` translator, and a `build` factory
// that constructs the AI SDK provider instance. No classes, no `this` — this
// matches the AI SDK's own idiom (`createOpenAI` returns a plain object) and
// keeps us at zero stylistic distance from the thing we wrap.
//
// The three type parameters preserve per-provider information so the registry
// can produce a discriminated, fully-typed union across all providers:
//   - `TName`     — the string literal naming the provider (used as the key)
//   - `TConfig`   — the provider's specific config shape
//   - `TInstance` — the AI SDK provider instance type returned by `build`

export interface ProviderDefinition<TName extends string, TConfig, TInstance> {
  /** Stable identifier; doubles as the registry key and the `provider/model` ID prefix. */
  readonly name: TName;
  /**
   * Env vars this provider reads. The FIRST entry is the credential gate —
   * its presence is what enables the provider in CLI env-discovery. Remaining
   * entries are optional overrides. Listed for documentation, `--help` output,
   * and the missing-key error message.
   */
  readonly envVars: readonly string[];
  /**
   * Config keys that must be present as non-empty strings in a shorthand
   * config. Validated at `createGateway` time (see `parseGatewayConfig`) so a
   * typo in a JSON/layered config produces a friendly error at startup instead
   * of a confusing SDK env-var error at first request. Omit for providers whose
   * credentials come from a structural/SigV4/ADC config (bedrock, azure,
   * vertex, anthropic-aws). Instance-passthrough configs bypass this check.
   */
  readonly requiredKeys?: readonly string[];
  /**
   * Translate environment variables into a provider config. Returns `undefined`
   * when the credential gate (`envVars[0]`) is absent — signals the CLI to
   * skip this provider rather than throw. Pure function: no I/O, no globals
   * beyond the passed-in `env`.
   */
  fromEnv: (env: NodeJS.ProcessEnv) => TConfig | undefined;
  /** Construct the AI SDK provider instance from a validated config. */
  build: (cfg: TConfig) => TInstance;
}
