import { z } from 'zod';

import type { AnyTool, ToolCtx } from '../tools/types.js';
import { skillResourcesError } from './config/sanitize.js';
import type { SkillConfig, SkillContent, SkillCtx, SkillResource } from './types.js';

function resolveContent(content: SkillContent, ctx: ToolCtx) {
  if (typeof content === 'string') return content;
  const skillCtx: SkillCtx = { req: ctx.req, frogbot: ctx.frogbot };

  return content(skillCtx);
}

async function resolveResources(
  skill: SkillConfig,
  ctx: ToolCtx,
): Promise<readonly SkillResource[]> {
  if (typeof skill.resources !== 'function') return skill.resources ?? [];

  const resources = await skill.resources({ req: ctx.req });
  const error = skillResourcesError(skill.slug, resources);
  if (error) throw new Error(`[frogbot] ${error}`);

  return resources;
}

function available(values: readonly string[]) {
  return values.length > 0 ? values.join(', ') : 'none';
}

export function buildSkillTools(skills: readonly SkillConfig[]): AnyTool[] {
  const bySlug = new Map(skills.map((skill) => [skill.slug, skill]));

  return [
    {
      slug: 'list_skills',
      description: 'List available skills and their resources',
      inputSchema: z.object({}),
      execute: async (_input, ctx) => {
        const lines = await Promise.all(
          skills.map(async (skill) => {
            const description = skill.description ? `: ${skill.description}` : '';
            const resources = (await resolveResources(skill, ctx)).map(
              (resource) =>
                `  - ${resource.path}${resource.description ? `: ${resource.description}` : ''}`,
            );

            return [`- ${skill.slug}${description}`, ...resources].join('\n');
          }),
        );

        return lines.join('\n');
      },
    },
    {
      slug: 'load_skill',
      description: 'Load the instructions for an available skill',
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
      slug: 'load_skill_resource',
      description: 'Load a resource from an available skill',
      inputSchema: z.object({ skill: z.string(), path: z.string() }),
      execute: async ({ skill, path }, ctx) => {
        const match = bySlug.get(skill);
        if (!match) {
          return `Skill '${skill}' not found. Available skills: ${available(skills.map(({ slug }) => slug))}.`;
        }

        const resources = await resolveResources(match, ctx);
        const resource = resources.find((entry) => entry.path === path);
        if (!resource) {
          return `Resource '${path}' not found in skill '${skill}'. Available resources: ${available(resources.map(({ path: value }) => value))}.`;
        }

        return resolveContent(resource.content, ctx);
      },
    },
  ];
}
