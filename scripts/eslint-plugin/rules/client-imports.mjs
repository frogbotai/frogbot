import { isTypeOnly, moduleSources } from '../sources.mjs';

const RSC_ENTRY = /(?:^|\/)rsc(?:\/|\.[cm]?[jt]sx?$|$)/;

const PAYLOAD_UI_SUBPATH = /^@payloadcms\/ui\/(?:elements|icons)\//;

function isClientModule(program) {
  for (const statement of program.body) {
    if (typeof statement.directive !== 'string') return false;

    if (statement.directive === 'use client') return true;
  }

  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: "Disallow server-only imports in 'use client' files" },
    messages: {
      node: "'use client' files run in the browser, so they can't import the Node module \"{{source}}\".",
      rsc: "'use client' files can't import the server entry point \"{{source}}\".",
      payloadSubpath:
        '\'use client\' files import @payloadcms/ui from its root. "{{source}}" is a separate bundle with its own React contexts.',
    },
    schema: [],
  },
  create(context) {
    if (!isClientModule(context.sourceCode.ast)) return {};

    return moduleSources((source, node) => {
      if (isTypeOnly(node)) return;

      const messageId = source.value.startsWith('node:')
        ? 'node'
        : RSC_ENTRY.test(source.value)
          ? 'rsc'
          : PAYLOAD_UI_SUBPATH.test(source.value)
            ? 'payloadSubpath'
            : null;

      if (messageId) context.report({ node: source, messageId, data: { source: source.value } });
    });
  },
};
