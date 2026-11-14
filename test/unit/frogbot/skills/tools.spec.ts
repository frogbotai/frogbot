import { assert, describe, expect, it, vi } from 'vitest';

const req = { id: 'request' };
const frogbot = { id: 'frogbot' };
const ctx = { req, frogbot, agent: { slug: 'agent', runId: 'run' } };
const skills = [
  {
    slug: 'docs',
    description: 'Product docs',
    instructions: 'Read the documentation',
    resources: [{ path: 'api.md', description: 'API reference', content: 'API content' }],
  },
  {
    slug: 'dynamic',
    instructions: vi.fn(({ req: value }) => `Dynamic ${value.id}`),
    resources: [
      { path: 'runtime.md', content: vi.fn(({ frogbot: value }) => `Runtime ${value.id}`) },
    ],
  },
];

async function tools(list: readonly unknown[] = skills) {
  const { buildSkillTools } = await import('../../../../packages/frogbot/src/skills/tools.js');
  const built = buildSkillTools(list as never);

  const execute = (slug: string) => {
    const run = built.find((tool) => tool.slug === slug)?.execute;

    assert(run, `Expected the ${slug} tool`);

    return run;
  };

  return {
    list_skills: { execute: execute('list_skills') },
    load_skill: { execute: execute('load_skill') },
    load_skill_resource: { execute: execute('load_skill_resource') },
  };
}

describe('skill tools', () => {
  it('lists skills and resources without content', async () => {
    const result = await (await tools()).list_skills.execute({}, ctx as never);

    expect(result).toContain('docs');
    expect(result).toContain('Product docs');
    expect(result).toContain('api.md');
    expect(result).toContain('API reference');
    expect(result).not.toContain('API content');
  });

  it('loads string and function skill instructions', async () => {
    const registry = await tools();

    expect(await registry.load_skill.execute({ skill: 'docs' }, ctx as never)).toBe(
      'Read the documentation',
    );
    expect(await registry.load_skill.execute({ skill: 'dynamic' }, ctx as never)).toBe(
      'Dynamic request',
    );
    expect(skills[1].instructions).toHaveBeenCalledWith({ req, frogbot });
  });

  it('loads string and function skill resources', async () => {
    const registry = await tools();

    expect(
      await registry.load_skill_resource.execute({ skill: 'docs', path: 'api.md' }, ctx as never),
    ).toBe('API content');
    expect(
      await registry.load_skill_resource.execute(
        { skill: 'dynamic', path: 'runtime.md' },
        ctx as never,
      ),
    ).toBe('Runtime frogbot');
    expect(skills[1].resources[0].content).toHaveBeenCalledWith({ req, frogbot });
  });

  it('returns valid names for unknown skills and paths', async () => {
    const registry = await tools();

    expect(await registry.load_skill.execute({ skill: 'missing' }, ctx as never)).toContain(
      'docs, dynamic',
    );
    expect(
      await registry.load_skill_resource.execute(
        { skill: 'docs', path: 'missing.md' },
        ctx as never,
      ),
    ).toContain('api.md');
  });

  it('calls function resources with the request on every list and load', async () => {
    const files = ['plan.md'];
    const resources = vi.fn(() =>
      files.map((path) => ({ path, description: `File ${path}`, content: `Content ${path}` })),
    );

    const registry = await tools([{ slug: 'folder', instructions: 'Read the folder', resources }]);

    expect(await registry.list_skills.execute({}, ctx as never)).toContain('plan.md: File plan.md');

    files.push('later.md');

    expect(await registry.list_skills.execute({}, ctx as never)).toContain('later.md');
    expect(
      await registry.load_skill_resource.execute(
        { skill: 'folder', path: 'later.md' },
        ctx as never,
      ),
    ).toBe('Content later.md');
    expect(
      await registry.load_skill_resource.execute(
        { skill: 'folder', path: 'gone.md' },
        ctx as never,
      ),
    ).toContain('plan.md, later.md');
    expect(resources).toHaveBeenCalledTimes(4);
    expect(resources).toHaveBeenCalledWith({ req });
  });

  it('awaits async function resources', async () => {
    const registry = await tools([
      {
        slug: 'async',
        instructions: 'Read it',
        resources: () => Promise.resolve([{ path: 'a.md', content: 'A' }]),
      },
    ]);

    expect(
      await registry.load_skill_resource.execute({ skill: 'async', path: 'a.md' }, ctx as never),
    ).toBe('A');
  });

  it.each([
    [
      'a duplicate path',
      [
        { path: 'a.md', content: 'A' },
        { path: 'a.md', content: 'B' },
      ],
      "duplicate resource path 'a.md'",
    ],
    ['an empty path', [{ path: ' ', content: 'A' }], 'resource missing a path'],
    ['missing content', [{ path: 'a.md', content: '' }], "resource 'a.md' requires content"],
    [
      'an empty description',
      [{ path: 'a.md', description: '', content: 'A' }],
      'description must be a non-empty string',
    ],
    ['a non-array result', 'a.md', 'resources must be an array'],
  ])('reports %s from function resources as a tool error', async (_name, result, message) => {
    const registry = await tools([
      { slug: 'bad', instructions: 'Read it', resources: () => result },
    ]);

    await expect(registry.list_skills.execute({}, ctx as never)).rejects.toThrow(message);
    await expect(
      registry.load_skill_resource.execute({ skill: 'bad', path: 'a.md' }, ctx as never),
    ).rejects.toThrow(message);
  });
});
