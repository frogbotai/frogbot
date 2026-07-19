import { describe, expect, it } from 'vitest';

import { includesSignalLevel, resolveSignalLevels, signalLevelFromBody } from './signalLevel.js';

describe('signalLevel', () => {
  it('resolves defaults, global overrides, and namespace overrides', () => {
    expect(resolveSignalLevels()).toEqual({ gen_ai: 'recommended', http: 'recommended', frogbot: 'recommended' });
    expect(resolveSignalLevels('off')).toEqual({ gen_ai: 'off', http: 'off', frogbot: 'off' });
    expect(resolveSignalLevels({ gen_ai: 'full' })).toEqual({ gen_ai: 'full', http: 'recommended', frogbot: 'recommended' });
  });

  it('clamps client overrides to the operator baseline, never escalating', () => {
    const base = { gen_ai: 'off', http: 'off', frogbot: 'off' } as const;
    expect(resolveSignalLevels({ gen_ai: 'full' }, base)).toEqual({ gen_ai: 'off', http: 'off', frogbot: 'off' });
    expect(resolveSignalLevels(undefined, base)).toEqual(base);
    expect(resolveSignalLevels('required', base)).toEqual({ gen_ai: 'off', http: 'off', frogbot: 'off' });
    expect(resolveSignalLevels('full', base)).toEqual({ gen_ai: 'off', http: 'off', frogbot: 'off' });
  });

  it('lets client overrides downgrade individual namespaces below the baseline', () => {
    const base = { gen_ai: 'full', http: 'full', frogbot: 'full' } as const;
    expect(resolveSignalLevels('off', base)).toEqual({ gen_ai: 'off', http: 'off', frogbot: 'off' });
    expect(resolveSignalLevels({ gen_ai: 'required' }, base)).toEqual({ gen_ai: 'required', http: 'full', frogbot: 'full' });
  });

  it('compares signal levels by required minimum', () => {
    expect(includesSignalLevel('recommended', 'required')).toBe(true);
    expect(includesSignalLevel('off', 'required')).toBe(false);
  });

  it('reads per-request trace overrides from request bodies', () => {
    expect(signalLevelFromBody({ trace: false })).toBe('off');
    expect(signalLevelFromBody({ trace: 'full' })).toBe('full');
    expect(signalLevelFromBody({ trace: { gen_ai: 'off', http: 'required', unknown: 'full' } })).toEqual({ gen_ai: 'off', http: 'required' });
  });
});
