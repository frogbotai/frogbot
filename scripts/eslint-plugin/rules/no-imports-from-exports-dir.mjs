import { importSources } from '../sources.mjs';

const EXPORTS_DIR = /^(?:\.{1,2}\/)*exports\//;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow relative imports from an `exports/` directory' },
    messages: {
      exportsDir:
        '"{{source}}" imports from the exports layer. Import the module it re-exports instead.',
    },
    schema: [],
  },
  create(context) {
    return importSources((source) => {
      if (EXPORTS_DIR.test(source.value)) {
        context.report({ node: source, messageId: 'exportsDir', data: { source: source.value } });
      }
    });
  },
};
