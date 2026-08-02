import type { ToolCtx } from "./tool.js";

export type SkillCtx = Pick<ToolCtx, "req" | "frogbot">;

export type SkillContent =
  | string
  | ((ctx: SkillCtx) => string | Promise<string>);

export type SkillResource = {
  path: string;
  description?: string;
  content: SkillContent;
};

export type SkillConfig = {
  slug: string;
  description?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  instructions: SkillContent;
  resources?: readonly SkillResource[];
};
