import clientImports from './rules/client-imports.mjs';
import noImportsFromExportsDir from './rules/no-imports-from-exports-dir.mjs';
import noImportsFromSelf from './rules/no-imports-from-self.mjs';

/** @type {import('eslint').ESLint.Plugin} */
export default {
  meta: { name: 'frogbot' },
  rules: {
    'client-imports': clientImports,
    'no-imports-from-exports-dir': noImportsFromExportsDir,
    'no-imports-from-self': noImportsFromSelf,
  },
};
