import { isRecord } from '../../utilities/isRecord.js';
import type { SkillConfig } from '../types.js';

export function sanitizeSkills(agentSlug: string, skills: readonly SkillConfig[]): void {
  const skillSlugs = new Set<string>();

  for (const skill of skills) {
    if (!isRecord(skill) || typeof skill.slug !== 'string' || !skill.slug.trim()) {
      throw new Error(`[frogbot] Agent '${agentSlug}' has a skill missing a \`slug\`.`);
    }

    if (skill.slug !== skill.slug.trim() || encodeURIComponent(skill.slug) !== skill.slug) {
      throw new Error(
        `[frogbot] Skill slug '${skill.slug}' in agent '${agentSlug}' is not URL-safe.`,
      );
    }

    if (skillSlugs.has(skill.slug)) {
      throw new Error(`[frogbot] Duplicate skill slug '${skill.slug}' in agent '${agentSlug}'.`);
    }

    skillSlugs.add(skill.slug);
    if (
      typeof skill.instructions !== 'function' &&
      (typeof skill.instructions !== 'string' || !skill.instructions.trim())
    ) {
      throw new Error(
        `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' requires instructions.`,
      );
    }

    for (const field of ['description', 'license', 'compatibility'] as const) {
      const value = skill[field];
      if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
        throw new Error(
          `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' ${field} must be a non-empty string.`,
        );
      }
    }

    if (
      skill.metadata !== undefined &&
      (!isRecord(skill.metadata) ||
        Object.values(skill.metadata).some((value) => typeof value !== 'string'))
    ) {
      throw new Error(
        `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' metadata must contain only string values.`,
      );
    }

    if (skill.resources === undefined || typeof skill.resources === 'function') continue;
    if (!Array.isArray(skill.resources)) {
      throw new Error(
        `[frogbot] Agent '${agentSlug}' skill '${skill.slug}' resources must be an array or a function.`,
      );
    }

    const error = skillResourcesError(skill.slug, skill.resources);
    if (error) throw new Error(`[frogbot] Agent '${agentSlug}' ${error}`);
  }
}

/** Returns why a skill's resource list is invalid, or `undefined` when every entry is valid. */
export function skillResourcesError(skillSlug: string, resources: unknown): string | undefined {
  if (!Array.isArray(resources)) return `skill '${skillSlug}' resources must be an array.`;

  const paths = new Set<string>();

  for (const resource of resources) {
    if (!isRecord(resource) || typeof resource.path !== 'string' || !resource.path.trim()) {
      return `skill '${skillSlug}' has a resource missing a path.`;
    }

    if (paths.has(resource.path)) {
      return `skill '${skillSlug}' has a duplicate resource path '${resource.path}'.`;
    }

    paths.add(resource.path);
    if (
      resource.description !== undefined &&
      (typeof resource.description !== 'string' || !resource.description.trim())
    ) {
      return `skill '${skillSlug}' resource '${resource.path}' description must be a non-empty string.`;
    }

    if (
      typeof resource.content !== 'function' &&
      (typeof resource.content !== 'string' || !resource.content.trim())
    ) {
      return `skill '${skillSlug}' resource '${resource.path}' requires content.`;
    }
  }

  return undefined;
}
