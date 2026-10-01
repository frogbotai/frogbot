import * as p from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseArgs } from '../../../packages/create-frogbot-app/src/lib/args.js';
import { resolvePlan } from '../../../packages/create-frogbot-app/src/prompts.js';

vi.mock('@clack/prompts', () => ({
  cancel: vi.fn(),
  confirm: vi.fn(),
  password: vi.fn(),
  select: vi.fn(),
}));

const args = parseArgs(['my-app', '--db', 'sqlite', '--ai', 'openai', '--no-agents']);

function resolveInteractivePlan(env: Record<string, string>) {
  return resolvePlan({ args, cwd: '/tmp', detectedPackageManager: 'npm', env, tty: true });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('AI provider prompt', () => {
  beforeEach(() => {
    vi.mocked(p.select).mockImplementation(async ({ options }) => options[0].value);
    vi.mocked(p.password).mockResolvedValue('');
  });

  function resolveAIProviderPlan() {
    return resolvePlan({
      args: parseArgs(['my-app', '--db', 'sqlite', '--no-agents']),
      cwd: '/tmp',
      detectedPackageManager: 'npm',
      env: {},
      tty: true,
    });
  }

  it('lists OpenCode Zen first and sets no starting choice', async () => {
    await resolveAIProviderPlan();

    expect(p.select).toHaveBeenCalledTimes(1);

    const arg = vi.mocked(p.select).mock.calls[0][0];

    expect(arg.options.map(({ value }) => value)).toEqual([
      'zen',
      'openai',
      'anthropic',
      'google',
      'bedrock',
      'none',
    ]);
    expect(Object.keys(arg)).not.toContain('initialValue');
  });

  it('labels Zen "OpenCode Zen" with the paid-key hint', async () => {
    await resolveAIProviderPlan();

    const { options } = vi.mocked(p.select).mock.calls[0][0];

    expect(options[0]).toMatchObject({
      label: 'OpenCode Zen',
      hint: 'needs a paid Zen API key',
    });
    expect(options.at(-1)).toMatchObject({ label: 'None / add later', value: 'none' });
  });

  it('choosing the first option asks for OPENCODE_API_KEY', async () => {
    const plan = await resolveAIProviderPlan();

    expect(plan.ai).toBe('zen');
    expect(p.password).toHaveBeenCalledExactlyOnceWith({
      message: 'OPENCODE_API_KEY (leave blank to add it to .env later)',
    });
  });
});

describe('provider key found in the environment', () => {
  it('uses the environment key after the confirm is accepted', async () => {
    vi.mocked(p.confirm).mockResolvedValue(true);

    const plan = await resolveInteractivePlan({ OPENAI_API_KEY: 'sk-env' });

    expect(p.confirm).toHaveBeenCalledExactlyOnceWith({
      message: 'Found OPENAI_API_KEY in your environment. Use it for this app?',
      initialValue: true,
    });
    expect(p.password).not.toHaveBeenCalled();
    expect(plan.apiKey).toBe('sk-env');
  });

  it('asks for a key when the environment key is declined', async () => {
    vi.mocked(p.confirm).mockResolvedValue(false);
    vi.mocked(p.password).mockResolvedValue('sk-typed');

    const plan = await resolveInteractivePlan({ OPENAI_API_KEY: 'sk-env' });

    expect(p.password).toHaveBeenCalledExactlyOnceWith({
      message: 'OPENAI_API_KEY (leave blank to add it to .env later)',
    });
    expect(plan.apiKey).toBe('sk-typed');
  });

  it('leaves the key unset when the environment key is declined and the prompt is blank', async () => {
    vi.mocked(p.confirm).mockResolvedValue(false);
    vi.mocked(p.password).mockResolvedValue('');

    const plan = await resolveInteractivePlan({ OPENAI_API_KEY: 'sk-env' });

    expect(plan.apiKey).toBeUndefined();
  });

  it('skips the confirm when --api-key is given', async () => {
    const plan = await resolvePlan({
      args: parseArgs([
        'my-app',
        '--ai',
        'openai',
        '--db',
        'sqlite',
        '--no-agents',
        '--api-key',
        'sk-flag',
      ]),
      cwd: '/tmp',
      detectedPackageManager: 'npm',
      env: { OPENAI_API_KEY: 'sk-env' },
      tty: true,
    });

    expect(p.confirm).not.toHaveBeenCalled();
    expect(p.password).not.toHaveBeenCalled();
    expect(plan.apiKey).toBe('sk-flag');
  });

  it('asks for a key without a confirm when the environment has none', async () => {
    vi.mocked(p.password).mockResolvedValue('sk-typed');

    const plan = await resolveInteractivePlan({});

    expect(p.confirm).not.toHaveBeenCalled();
    expect(plan.apiKey).toBe('sk-typed');
  });
});
