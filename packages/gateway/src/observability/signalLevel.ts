export type SignalLevel = 'off' | 'required' | 'recommended' | 'full';

export type SignalNamespace = 'gen_ai' | 'http' | 'frogbot';

export type SignalLevels = Partial<Record<SignalNamespace, SignalLevel>>;

export type SignalLevelInput = SignalLevel | SignalLevels | undefined;

/** Context key where the per-request trace override (from the request body) is stashed by `beforeOperation`. */
export const traceOverrideKey = 'frogbot.gateway.traceOverride';

const order: Record<SignalLevel, number> = {
  off: 0,
  required: 1,
  recommended: 2,
  full: 3,
};

export const defaultSignalLevels: Required<SignalLevels> = {
  gen_ai: 'recommended',
  http: 'recommended',
  frogbot: 'recommended',
};

export function resolveSignalLevels(input?: SignalLevelInput, base?: Required<SignalLevels>): Required<SignalLevels> {
  // No `base` means the operator is establishing the baseline from defaults —
  // any level is allowed. When a `base` is supplied the input is a per-request
  // client override, which may only downgrade the operator baseline (a ceiling),
  // never escalate it — for both scalar and per-namespace object overrides.
  if (base === undefined) {
    if (!input) {
      return defaultSignalLevels;
    }
    if (typeof input === 'string') {
      return { gen_ai: input, http: input, frogbot: input };
    }
    return { ...defaultSignalLevels, ...input };
  }
  if (!input) {
    return base;
  }
  const override: SignalLevels = typeof input === 'string' ? { gen_ai: input, http: input, frogbot: input } : input;
  return Object.fromEntries(
    (Object.keys(base) as SignalNamespace[]).map((ns) => {
      const overrideLevel = override[ns];
      const level = overrideLevel !== undefined && order[overrideLevel] < order[base[ns]] ? overrideLevel : base[ns];
      return [ns, level];
    }),
  ) as Required<SignalLevels>;
}

export function includesSignalLevel(actual: SignalLevel, minimum: SignalLevel): boolean {
  return order[actual] >= order[minimum];
}

export function signalLevelFromBody(body: unknown): SignalLevelInput {
  if (!body || typeof body !== 'object' || !('trace' in body)) return undefined;
  const trace = (body as { trace?: unknown }).trace;
  if (trace === false) return 'off';
  if (typeof trace === 'string' && trace in order) return trace as SignalLevel;
  if (!trace || typeof trace !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(trace).filter(([key, value]) => key in defaultSignalLevels && typeof value === 'string' && value in order),
  ) as SignalLevels;
}
