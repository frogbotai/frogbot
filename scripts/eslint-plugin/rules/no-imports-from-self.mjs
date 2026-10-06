import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { moduleSources } from '../sources.mjs';

const names = new Map();

function packageName(dir) {
  if (names.has(dir)) return names.get(dir);

  const manifest = path.join(dir, 'package.json');
  const parent = path.dirname(dir);
  let name = null;

  if (existsSync(manifest)) name = JSON.parse(readFileSync(manifest, 'utf8')).name ?? null;
  else if (parent !== dir) name = packageName(parent);

  names.set(dir, name);

  return name;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow a package from importing itself by name' },
    messages: {
      self: '"{{source}}" imports {{name}} from inside {{name}}. Use a relative import.',
    },
    schema: [],
  },
  create(context) {
    const name = packageName(path.dirname(context.physicalFilename));

    if (!name) return {};

    return moduleSources((source) => {
      if (source.value === name || source.value.startsWith(`${name}/`)) {
        context.report({ node: source, messageId: 'self', data: { source: source.value, name } });
      }
    });
  },
};
