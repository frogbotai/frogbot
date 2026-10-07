// Vitest globalSetup for the heavy projects: the run takes one machine-wide heavy-test slot and
// gives it back at teardown (scripts/lib/slot.mjs).
import type { TestProject } from 'vitest/node';

import { acquireSlot } from '../scripts/lib/slot.mjs';

export default function setup(project: TestProject) {
  return acquireSlot(project.name);
}
