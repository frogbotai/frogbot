import { existsSync } from 'node:fs';
import path from 'node:path';

const DIRECTIVES = [
  /^eslint(?:-enable)?\s/,
  /^eslint-enable$/,
  /^globals?\s/,
  /^exported\s/,
  /^@ts-(?:expect-error|ignore|nocheck|check)\b/,
  /^prettier-ignore\b/,
  /^(?:c8|v8|istanbul) ignore\b/,
  /^@vite-ignore$/,
  /^(?:webpack|turbopack)[A-Z]\w*:/,
  /^[#@]__(?:PURE|NO_SIDE_EFFECTS)__$/,
  /^@jsx(?:ImportSource|Runtime|Frag)?\s/,
  /^Workaround: https?:\/\/\S+, remove when \S/,
  /^[#@] sourceMappingURL=/,
  /^check: full-only$/,
];

const DISABLE = /^(?:eslint|oxlint)-disable(?:-next-line|-line)?(?:\s|$)/;

const REASON = /\s--\s*\S/;

const JS_TYPES =
  /@(?:type|typedef|param|returns?|template|satisfies|import|callback|property|enum|this|overload)\b/;

const JS_FILE = /\.[cm]?jsx?$/;

const MEMBERS = new Set([
  'AccessorProperty',
  'MethodDefinition',
  'Property',
  'PropertyDefinition',
  'TSAbstractAccessorProperty',
  'TSAbstractMethodDefinition',
  'TSAbstractPropertyDefinition',
  'TSCallSignatureDeclaration',
  'TSConstructSignatureDeclaration',
  'TSEnumMember',
  'TSIndexSignature',
  'TSMethodSignature',
  'TSPropertySignature',
]);

const EXPORTS = new Set([
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'TSExportAssignment',
]);

const vendored = new Map();

function isVendored(dir) {
  if (vendored.has(dir)) return vendored.get(dir);

  const parent = path.dirname(dir);
  const result =
    existsSync(path.join(dir, 'VENDORED.md')) || (parent !== dir && isVendored(parent));

  vendored.set(dir, result);

  return result;
}

function declaredNames(node) {
  if (node.type === 'VariableDeclaration') {
    return node.declarations.flatMap(({ id }) => (id.type === 'Identifier' ? [id.name] : []));
  }

  return node.id?.type === 'Identifier' ? [node.id.name] : [];
}

function localExports(program) {
  const names = new Set();

  for (const node of program.body) {
    if (node.type === 'ExportNamedDeclaration' && !node.source) {
      for (const specifier of node.specifiers) {
        if (specifier.local.type === 'Identifier') names.add(specifier.local.name);
      }
    }

    if (node.type === 'ExportDefaultDeclaration' && node.declaration.type === 'Identifier') {
      names.add(node.declaration.name);
    }

    if (node.type === 'TSExportAssignment' && node.expression.type === 'Identifier') {
      names.add(node.expression.name);
    }
  }

  return names;
}

function removalRange(text, [start, end]) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const newline = text.indexOf('\n', end);
  const lineEnd = newline === -1 ? text.length : newline;
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);

  if (before.trim() === '' && after.trim() === '') {
    if (newline !== -1) return { range: [lineStart, newline + 1], text: '' };

    return { range: [Math.max(0, lineStart - 1), lineEnd], text: '' };
  }

  if (after.trim() === '') {
    return { range: [start - (before.length - before.trimEnd().length), lineEnd], text: '' };
  }

  const spaceAfter = after.length - after.trimStart().length;

  if (before.trim() === '') return { range: [start, end + spaceAfter], text: '' };

  const spaceBefore = before.length - before.trimEnd().length;

  if (spaceBefore > 0) return { range: [start - spaceBefore, end], text: '' };

  if (spaceAfter > 0) return { range: [start, end + spaceAfter], text: '' };

  return { range: [start, end], text: ' ' };
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description:
        'Disallow comments except JSDoc on exports, tool directives and upstream workaround links',
    },
    messages: {
      comment:
        'Remove this comment. Allowed: JSDoc on exports and their members, tool directives, and `// Workaround: <upstream URL>, remove when <condition>`.',
      reason: 'Give this directive a reason: `-- why`.',
    },
    schema: [],
  },
  create(context) {
    if (isVendored(path.dirname(context.physicalFilename))) return {};

    const { sourceCode } = context;
    const { text } = sourceCode;
    const isJs = JS_FILE.test(context.physicalFilename);

    let exportedNames = new Set();

    function isExported(node) {
      if (EXPORTS.has(node.type)) return true;

      const { parent } = node;

      if (!parent) return false;

      if (parent.type === 'Program') {
        return declaredNames(node).some((name) => exportedNames.has(name));
      }

      if (parent.type === 'TSModuleBlock') return true;

      if (EXPORTS.has(parent.type)) return true;

      if (!MEMBERS.has(node.type)) return false;

      let child = node;

      for (let ancestor = parent; ancestor; child = ancestor, ancestor = ancestor.parent) {
        if (ancestor.type === 'BlockStatement' || ancestor.type === 'StaticBlock') return false;

        if (ancestor.type === 'ArrowFunctionExpression' && ancestor.body === child) return false;

        if (EXPORTS.has(ancestor.type) || ancestor.type === 'TSModuleBlock') return true;

        if (ancestor.parent?.type === 'Program') return isExported(ancestor);
      }

      return false;
    }

    function documentsExport(comment) {
      const token = sourceCode.getTokenAfter(comment);

      if (!token) return false;

      let node = sourceCode.getNodeByRangeIndex(token.range[0]);

      while (
        node?.parent &&
        node.parent.type !== 'Program' &&
        node.parent.range[0] === node.range[0]
      ) {
        node = node.parent;
      }

      return Boolean(node) && node.type !== 'Program' && isExported(node);
    }

    function allowed(comment) {
      if (comment.type === 'Shebang') return true;

      if (comment.type === 'Line' && /^\/\s*<(?:reference|amd-module)\b/.test(comment.value)) {
        return true;
      }

      const value = comment.value.replace(/^\*?\s*/, '').trim();

      if (DIRECTIVES.some((pattern) => pattern.test(value))) return true;

      if (comment.type === 'Block' && /^\*(?!\*)/.test(comment.value)) {
        if (isJs && JS_TYPES.test(comment.value)) return true;

        return documentsExport(comment);
      }

      return false;
    }

    function jsxContainer(comment) {
      const node = sourceCode.getNodeByRangeIndex(comment.range[0]);

      if (
        node?.type === 'JSXExpressionContainer' &&
        node.expression.type === 'JSXEmptyExpression'
      ) {
        return node;
      }

      if (node?.type === 'JSXEmptyExpression' && node.parent?.type === 'JSXExpressionContainer') {
        return node.parent;
      }

      return null;
    }

    return {
      Program(program) {
        exportedNames = localExports(program);

        const removed = [];

        for (const comment of sourceCode.getAllComments()) {
          const value = comment.value.trim();

          if (DISABLE.test(value)) {
            if (!REASON.test(value)) context.report({ loc: comment.loc, messageId: 'reason' });

            continue;
          }

          if (allowed(comment)) continue;

          const container = jsxContainer(comment);
          const range = container ? container.range : comment.range;

          removed.push({ comment, ...removalRange(text, range) });
        }

        const groups = [];

        for (const item of removed.sort((a, b) => a.range[0] - b.range[0])) {
          const last = groups.at(-1);

          if (last && item.range[0] <= last.range[1] && last.text === '' && item.text === '') {
            last.range[1] = Math.max(last.range[1], item.range[1]);
            last.comments.push(item.comment);
          } else {
            groups.push({ range: [...item.range], text: item.text, comments: [item.comment] });
          }
        }

        for (const group of groups) {
          const fix = (fixer) => fixer.replaceTextRange(group.range, group.text);

          for (const comment of group.comments) {
            context.report({ loc: comment.loc, messageId: 'comment', fix });
          }
        }
      },
    };
  },
};
