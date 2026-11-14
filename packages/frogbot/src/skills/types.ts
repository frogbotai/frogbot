import type { ToolCtx } from '../tools/types.js';

export type SkillCtx = Pick<ToolCtx, 'req' | 'frogbot'>;

export type SkillContent = string | ((ctx: SkillCtx) => string | Promise<string>);

export type SkillResource = {
  path: string;
  description?: string;
  content: SkillContent;
};

/** Resources as a list, or a function called each time `list_skills` or `load_skill_resource` runs. */
export type SkillResources =
  | readonly SkillResource[]
  | ((ctx: Pick<SkillCtx, 'req'>) => readonly SkillResource[] | Promise<readonly SkillResource[]>);

export type SkillConfig = {
  slug: string;
  description?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  instructions: SkillContent;
  resources?: SkillResources;
};
