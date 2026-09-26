import { createRequire } from 'node:module';
import { join } from 'node:path';

function getTestToolsDirectory(): string | undefined {
  return (
    process.env.FROGBOT_TEST_TOOLS ?? process.env.FROGBOT_JOBS_TOOLS ?? process.env.TICKET121_TOOLS
  );
}

export function hasTestTool(name: string): boolean {
  const directory = getTestToolsDirectory();

  if (!directory) return false;

  try {
    createRequire(join(directory, 'package.json')).resolve(name);

    return true;
  } catch {
    return false;
  }
}

export function requireTestTool(name: string) {
  const directory = getTestToolsDirectory();

  if (!directory) {
    throw new Error(`Set FROGBOT_TEST_TOOLS to a directory that can resolve '${name}'.`);
  }

  return createRequire(join(directory, 'package.json'))(name);
}
