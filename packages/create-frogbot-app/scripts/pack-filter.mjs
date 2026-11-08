import path from 'node:path';

const skip = new Set([
  'node_modules',
  'dist',
  '.next',
  '.env',
  '.env.local',
  'frogbot-types.ts',
  'next-env.d.ts',
  'AGENTS.md',
]);

const uploads = new Set(['files', 'media']);

/**
 * Whether the pack copies `entry`, a path inside the template folder `templateDir`.
 *
 * @param {string} templateDir
 * @param {string} entry
 */
export function packs(templateDir, entry) {
  const base = path.basename(entry);

  return (
    !skip.has(base) &&
    !uploads.has(path.relative(templateDir, entry)) &&
    !/\.db(-journal|-shm|-wal)?$/.test(base) &&
    !base.endsWith('.tsbuildinfo')
  );
}
