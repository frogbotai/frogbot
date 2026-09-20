import fs from 'node:fs';
import path from 'node:path';

import type { AgentTarget } from '../types.js';

const POINTERS: Partial<Record<AgentTarget, { file: string; heading: string }>> = {
  claude: { file: 'CLAUDE.md', heading: 'Claude Code' },
  codex: { file: 'AGENTS.md', heading: 'Agents' },
  cursor: { file: 'AGENTS.md', heading: 'Agents' },
  opencode: { file: 'AGENTS.md', heading: 'Agents' },
  copilot: { file: '.github/copilot-instructions.md', heading: 'GitHub Copilot Instructions' },
  gemini: { file: 'GEMINI.md', heading: 'Gemini' },
};

export function installSkill(dest: string, skillSource: string, agents: AgentTarget[]): boolean {
  if (agents.length === 0) return true;
  if (!fs.existsSync(skillSource)) return false;

  const usesClaude = agents.includes('claude');
  const usesAgents = agents.some((agent) => agent !== 'claude');

  if (usesClaude) {
    fs.cpSync(skillSource, path.join(dest, '.claude', 'skills', 'frogbot'), { recursive: true });
  }
  if (usesAgents) {
    fs.cpSync(skillSource, path.join(dest, '.agents', 'skills', 'frogbot'), { recursive: true });
  }

  const written = new Set<string>();

  for (const agent of agents) {
    const pointer = POINTERS[agent]!;

    if (written.has(pointer.file)) continue;

    const skillDir = agent === 'claude' ? '.claude/skills/frogbot' : '.agents/skills/frogbot';
    const file = path.join(dest, pointer.file);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      `# ${pointer.heading}\n\nThis project uses the FrogBot skill at \`${skillDir}/\`.\nStart with \`${skillDir}/SKILL.md\` for a quick reference, then see \`${skillDir}/reference/\` for detailed docs.\n`,
    );
    written.add(pointer.file);
  }

  return true;
}
