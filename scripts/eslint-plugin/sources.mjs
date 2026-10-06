function checker(visit) {
  return (node) => {
    if (node.source?.type === 'Literal' && typeof node.source.value === 'string') {
      visit(node.source, node);
    }
  };
}

export function importSources(visit) {
  const check = checker(visit);

  return { ImportDeclaration: check, ImportExpression: check };
}

export function moduleSources(visit) {
  const check = checker(visit);

  return {
    ...importSources(visit),
    ExportAllDeclaration: check,
    ExportNamedDeclaration: check,
  };
}

export function isTypeOnly(node) {
  return node.importKind === 'type' || node.exportKind === 'type';
}
