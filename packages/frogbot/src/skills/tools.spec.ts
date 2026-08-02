import { describe, expect, it, vi } from "vitest";

const req = { id: "request" };
const frogbot = { id: "frogbot" };
const ctx = { req, frogbot, agent: { slug: "agent", runId: "run" } };
const skills = [
  {
    slug: "docs",
    description: "Product docs",
    instructions: "Read the documentation",
    resources: [
      { path: "api.md", description: "API reference", content: "API content" },
    ],
  },
  {
    slug: "dynamic",
    instructions: vi.fn(({ req: value }) => `Dynamic ${value.id}`),
    resources: [
      { path: "runtime.md", content: vi.fn(({ frogbot: value }) => `Runtime ${value.id}`) },
    ],
  },
];

async function tools() {
  const { buildSkillTools } = await import("./tools.js");
  return Object.fromEntries(buildSkillTools(skills as never).map((tool) => [tool.slug, tool]));
}

describe("skill tools", () => {
  it("lists skills and resources without content", async () => {
    const result = await (await tools()).list_skills.execute({}, ctx as never);

    expect(result).toContain("docs");
    expect(result).toContain("Product docs");
    expect(result).toContain("api.md");
    expect(result).toContain("API reference");
    expect(result).not.toContain("API content");
  });

  it("loads string and function skill instructions", async () => {
    const registry = await tools();

    expect(await registry.load_skill.execute({ skill: "docs" }, ctx as never)).toBe(
      "Read the documentation",
    );
    expect(await registry.load_skill.execute({ skill: "dynamic" }, ctx as never)).toBe(
      "Dynamic request",
    );
    expect(skills[1].instructions).toHaveBeenCalledWith({ req, frogbot });
  });

  it("loads string and function skill resources", async () => {
    const registry = await tools();

    expect(await registry.load_skill_resource.execute(
      { skill: "docs", path: "api.md" },
      ctx as never,
    )).toBe("API content");
    expect(await registry.load_skill_resource.execute(
      { skill: "dynamic", path: "runtime.md" },
      ctx as never,
    )).toBe("Runtime frogbot");
    expect(skills[1].resources[0].content).toHaveBeenCalledWith({ req, frogbot });
  });

  it("returns valid names for unknown skills and paths", async () => {
    const registry = await tools();

    expect(await registry.load_skill.execute({ skill: "missing" }, ctx as never)).toContain(
      "docs, dynamic",
    );
    expect(await registry.load_skill_resource.execute(
      { skill: "docs", path: "missing.md" },
      ctx as never,
    )).toContain("api.md");
  });
});
