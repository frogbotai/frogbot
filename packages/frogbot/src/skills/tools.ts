import { z } from "zod";

import type { SkillConfig, SkillContent, SkillCtx } from "../types/skill.js";
import type { AnyTool, ToolCtx } from "../types/tool.js";

function resolveContent(content: SkillContent, ctx: ToolCtx) {
  if (typeof content === "string") return content;
  const skillCtx: SkillCtx = { req: ctx.req, frogbot: ctx.frogbot };
  return content(skillCtx);
}

function available(values: readonly string[]) {
  return values.length > 0 ? values.join(", ") : "none";
}

export function buildSkillTools(skills: readonly SkillConfig[]): AnyTool[] {
  const bySlug = new Map(skills.map((skill) => [skill.slug, skill]));

  return [
    {
      slug: "list_skills",
      description: "List available skills and their resources",
      inputSchema: z.object({}),
      execute: () =>
        skills
          .map((skill) => {
            const description = skill.description
              ? `: ${skill.description}`
              : "";
            const resources = (skill.resources ?? []).map((resource) =>
              `  - ${resource.path}${resource.description ? `: ${resource.description}` : ""}`
            );
            return [`- ${skill.slug}${description}`, ...resources].join("\n");
          })
          .join("\n"),
    },
    {
      slug: "load_skill",
      description: "Load the instructions for an available skill",
      inputSchema: z.object({ skill: z.string() }),
      execute: ({ skill }, ctx) => {
        const match = bySlug.get(skill);
        if (!match) {
          return `Skill '${skill}' not found. Available skills: ${available(skills.map(({ slug }) => slug))}.`;
        }
        return resolveContent(match.instructions, ctx);
      },
    },
    {
      slug: "load_skill_resource",
      description: "Load a resource from an available skill",
      inputSchema: z.object({ skill: z.string(), path: z.string() }),
      execute: ({ skill, path }, ctx) => {
        const match = bySlug.get(skill);
        if (!match) {
          return `Skill '${skill}' not found. Available skills: ${available(skills.map(({ slug }) => slug))}.`;
        }
        const resource = match.resources?.find((entry) => entry.path === path);
        if (!resource) {
          return `Resource '${path}' not found in skill '${skill}'. Available resources: ${available((match.resources ?? []).map(({ path: value }) => value))}.`;
        }
        return resolveContent(resource.content, ctx);
      },
    },
  ];
}
