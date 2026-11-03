import fs from 'node:fs';
import path from 'node:path';

import {
  type Identifier,
  type ImportDeclaration,
  IndentationText,
  Node,
  type ObjectLiteralExpression,
  Project,
  QuoteKind,
  type SourceFile,
  SyntaxKind,
  VariableDeclarationKind,
} from 'ts-morph';

import { CliError } from './errors.js';

export const CONFIG_FILE = 'src/frogbot.config.ts';

const EXPECTED_SHAPE =
  '`export default buildConfig({ ... })`, or `export default buildConfig(config)` with `const config = { ... }`';

export interface ConfigFile {
  file: SourceFile;
  /** Names the file imported when it was opened. */
  imported: Set<string>;
  /** The object literal passed to `buildConfig`. */
  object: ObjectLiteralExpression;
  path: string;
  /** Modules whose files or dependencies the scaffold deletes; no import may remain. */
  removedModule?: (moduleSpecifier: string) => boolean;
  /** Names imported and referenced when the file was opened. */
  used: Set<string>;
}

function referencedNames(file: SourceFile): Set<string> {
  return new Set(
    file
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter((identifier) => !identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration))
      .map((identifier) => identifier.getText()),
  );
}

function valueReferences(file: SourceFile): Set<string> {
  return new Set(
    file
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter((identifier) => {
        const parent = identifier.getParent();

        if (identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) return false;
        if (Node.isPropertyAccessExpression(parent)) return parent.getNameNode() !== identifier;
        if (Node.isQualifiedName(parent)) return parent.getRight() !== identifier;
        if (Node.isShorthandPropertyAssignment(parent)) return true;

        return !(Node.isPropertyNamed(parent) && parent.getNameNode() === identifier);
      })
      .map((identifier) => identifier.getText()),
  );
}

function importedNames(file: SourceFile): Set<string> {
  return new Set(
    file
      .getImportDeclarations()
      .flatMap((declaration) => [
        ...declaration
          .getNamedImports()
          .map((named) => named.getAliasNode()?.getText() ?? named.getName()),
        declaration.getDefaultImport()?.getText(),
        declaration.getNamespaceImport()?.getText(),
      ])
      .filter((name) => name !== undefined),
  );
}

function buildConfigName(file: SourceFile): string {
  const specifier = file
    .getImportDeclaration('frogbot')
    ?.getNamedImports()
    .find((named) => named.getName() === 'buildConfig');

  return specifier?.getAliasNode()?.getText() ?? 'buildConfig';
}

function configObject(file: SourceFile): ObjectLiteralExpression | undefined {
  const exported = file.getExportAssignment((assignment) => !assignment.isExportEquals());
  const call = exported?.getExpression().asKind(SyntaxKind.CallExpression);

  if (call?.getExpression().getText() !== buildConfigName(file)) return undefined;

  const [arg] = call.getArguments();

  if (Node.isObjectLiteralExpression(arg)) return arg;
  if (!Node.isIdentifier(arg)) return undefined;

  const declaration = file.getVariableDeclaration(arg.getText());

  if (declaration?.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const) {
    return undefined;
  }

  return declaration.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
}

export function openConfig(dest: string): ConfigFile {
  const configPath = path.join(dest, CONFIG_FILE);
  const project = new Project({
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
    },
    useInMemoryFileSystem: true,
  });

  const file = project.createSourceFile(configPath, fs.readFileSync(configPath, 'utf8'));
  const object = configObject(file);

  if (!object) {
    throw new CliError(`Can't edit ${configPath}: expected ${EXPECTED_SHAPE}.`);
  }

  return {
    file,
    imported: importedNames(file),
    object,
    path: configPath,
    used: referencedNames(file),
  };
}

function assertNothingDangling(config: ConfigFile, emptied: Set<ImportDeclaration>): void {
  const imported = importedNames(config.file);
  const dangling = [...valueReferences(config.file)].filter(
    (name) => config.imported.has(name) && !imported.has(name),
  );

  if (dangling.length > 0) {
    throw new CliError(
      `Can't edit ${config.path}: ${dangling.map((name) => `\`${name}\``).join(', ')} is still used after its import was replaced.`,
    );
  }

  const kept = config.file
    .getImportDeclarations()
    .filter((declaration) => !emptied.has(declaration))
    .map((declaration) => declaration.getModuleSpecifierValue())
    .filter((specifier) => config.removedModule?.(specifier));

  if (kept.length > 0) {
    throw new CliError(
      `Can't edit ${config.path} for --ai none: ${kept.map((specifier) => `'${specifier}'`).join(', ')} is still imported after the AI parts were removed.`,
    );
  }
}

function prunedText(config: ConfigFile): string {
  const used = referencedNames(config.file);
  const unused = (name: Identifier | undefined) =>
    name !== undefined && config.used.has(name.getText()) && !used.has(name.getText());

  const removed: [number, number][] = [];
  const emptiedDeclarations = new Set<ImportDeclaration>();

  for (const declaration of config.file.getImportDeclarations()) {
    for (const named of declaration.getNamedImports()) {
      if (unused(named.getAliasNode() ?? named.getNameNode().asKind(SyntaxKind.Identifier))) {
        named.remove();
      }
    }

    if (unused(declaration.getDefaultImport())) declaration.removeDefaultImport();
    if (unused(declaration.getNamespaceImport())) declaration.removeNamespaceImport();

    const emptied =
      declaration.getImportClause() !== undefined &&
      !declaration.getDefaultImport() &&
      !declaration.getNamespaceImport() &&
      declaration.getNamedImports().length === 0;

    if (emptied) {
      emptiedDeclarations.add(declaration);
      removed.push([declaration.getStart(), declaration.getEnd()]);
    }
  }

  assertNothingDangling(config, emptiedDeclarations);

  let text = config.file.getFullText();

  for (const [start, end] of removed.reverse()) {
    const lineEnd = /^[^\S\n]*\r?\n/.exec(text.slice(end))?.[0].length ?? 0;

    const head = text.slice(0, start);
    const tail = text.slice(end + lineEnd);

    text = head + (/\n\s*\n$/.test(head) ? tail.replace(/^(\s*\n)+/, '') : tail);
  }

  return text;
}

/**
 * Writes the file, dropping imports the edits left unused; imports unused from the start stay.
 * A removed import's leading blank line stays, so import groups keep their separation.
 */
export function saveConfig(config: ConfigFile): void {
  fs.writeFileSync(config.path, prunedText(config));
}

/** The property named `name`, whether written `name` or `'name'`. */
export function getProperty(object: ObjectLiteralExpression, name: string) {
  return object.getProperty((property) => {
    if (Node.isShorthandPropertyAssignment(property)) return property.getName() === name;
    if (!Node.isPropertyNamed(property)) return false;

    const node = property.getNameNode();

    return (
      (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)
        ? node.getLiteralText()
        : node.getText()) === name
    );
  });
}

/**
 * Replaces the property's value, or adds the property at the end. A new property starts as a
 * placeholder so `value` is indented the same way in both cases.
 */
export function setProperty(object: ObjectLiteralExpression, name: string, value: string): void {
  const property =
    getProperty(object, name) ?? object.addPropertyAssignment({ initializer: '0', name });

  property.replaceWithText(`${name}: ${value}`);
}

export function removeProperty(object: ObjectLiteralExpression, name: string): void {
  getProperty(object, name)?.remove();
}

/** The object literal assigned to `name`, if there is one. */
export function objectProperty(
  object: ObjectLiteralExpression,
  name: string,
): ObjectLiteralExpression | undefined {
  return getProperty(object, name)
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
}

/**
 * Imports `name` from `moduleSpecifier` in place of the first `replacing` import if any, keeping
 * the comments above it, and removes the other `replacing` imports.
 */
export function setImport(
  file: SourceFile,
  name: string,
  moduleSpecifier: string,
  replacing: string[],
): void {
  const declarations = file.getImportDeclarations();
  const existing = declarations.find(
    (declaration) => declaration.getModuleSpecifierValue() === moduleSpecifier,
  );

  const replaced = declarations.filter(
    (declaration) =>
      declaration !== existing && replacing.includes(declaration.getModuleSpecifierValue()),
  );

  if (existing) {
    if (!existing.getNamedImports().some((named) => named.getName() === name)) {
      existing.addNamedImport(name);
    }
  } else if (replaced[0]) {
    const [first] = replaced.splice(0, 1);

    first.removeDefaultImport();
    first.removeNamespaceImport();
    first.removeNamedImports();
    first.setIsTypeOnly(false);
    first.setModuleSpecifier(moduleSpecifier);
    first.addNamedImport(name);
  } else {
    file.insertImportDeclaration(0, { moduleSpecifier, namedImports: [name] });
  }

  for (const declaration of replaced) declaration.remove();
}

/** The module `name` is imported from, if it is imported. */
export function importSource(file: SourceFile, name: string): string | undefined {
  for (const declaration of file.getImportDeclarations()) {
    const names = [
      ...declaration
        .getNamedImports()
        .map((named) => named.getAliasNode()?.getText() ?? named.getName()),
      declaration.getDefaultImport()?.getText(),
      declaration.getNamespaceImport()?.getText(),
    ];

    if (names.includes(name)) return declaration.getModuleSpecifierValue();
  }

  return undefined;
}

export function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
