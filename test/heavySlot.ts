import type { TestProject } from 'vitest/node';

import { acquireSlot } from '../scripts/lib/slot.mjs';

export default function setup(project: TestProject) {
  return acquireSlot(project.name);
}
