import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('packages/pieces');

function camelCase(value) {
  const result = value.replace(/[-_\s]+(.)?/g, (_, letter) => letter ? letter.toUpperCase() : '').replace(/^[A-Z]/, (letter) => letter.toLowerCase());
  return /^\d/.test(result) ? `action${result}` : result;
}

function pascalCase(value) {
  return value[0].toUpperCase() + value.slice(1);
}

function oauthScopes(metadata) {
  const auth = Array.isArray(metadata.auth) ? metadata.auth : [metadata.auth];
  return [...new Set(auth.flatMap((entry) => entry?.type === 'OAUTH2' && Array.isArray(entry.scope) ? entry.scope : []))];
}

for (const directory of (await readdir(root)).filter((name) => name.startsWith('piece-')).sort()) {
  const file = path.join(root, directory, 'src/index.ts');
  const source = await readFile(file, 'utf8');
  const dependency = JSON.parse(await readFile(path.join(root, directory, 'package.json'), 'utf8')).dependencies;
  const activepiecesPackage = Object.keys(dependency).find((name) => name.startsWith('@activepieces/piece-'));
  if (!activepiecesPackage) continue;
  const alias = source.match(/export const (\w+) = create(?:ActivepiecesPiece|\w+)\(/)?.[1];
  const factory = source.match(/export function create(\w+)\(/)?.[1];
  const instance = alias ?? (factory ? factory[0].toLowerCase() + factory.slice(1) : undefined);
  const service = source.match(/service:\s*["']([^"']+)/)?.[1];
  const credentialType = source.match(/credentialType:\s*["']([^"']+)/)?.[1];
  const actionsName = source.match(/export const (\w+Actions)\s*=\s*\[|export const (\w+Actions)\s*=\s*Object/)?.slice(1).find(Boolean);
  if (!instance || !service || !credentialType || !actionsName) throw new Error(`Cannot parse ${file}`);

  const imported = await import(pathToFileURL(createRequire(path.join(root, directory, 'package.json')).resolve(activepiecesPackage)).href);
  const piece = Object.values(imported).find((value) => value && typeof value === 'object' && typeof value.metadata === 'function' && typeof value.actions === 'function');
  if (!piece) throw new Error(`Cannot load ${activepiecesPackage}`);
  const actions = Object.values(piece.actions());
  const names = new Map();
  const properties = actions.map((action) => {
    const base = camelCase(action.name);
    const count = (names.get(base) ?? 0) + 1;
    names.set(base, count);
    const name = count === 1 ? base : `${base}${count}`;
    const description = String(action.description || action.displayName || '').replaceAll('*/', '* /').replaceAll('\n', ' ');
    return `    /** ${action.displayName}${description ? `: ${description}` : ''} */\n    ${name}: piece.tool(${JSON.stringify(action.name)}),`;
  }).join('\n');
  const scopes = oauthScopes(piece.metadata());
  const importLine = source.match(/^import \* as \w+ from [^;]+;/m)?.[0] ?? `import * as module from ${JSON.stringify(activepiecesPackage)};`;
  const moduleName = importLine.match(/import \* as (\w+)/)[1];
  const actionsBlock = source.match(new RegExp(`export const ${actionsName}\\s*=\\s*\\[[\\s\\S]*?\\] as const;`))?.[0];
  if (!actionsBlock) throw new Error(`Cannot parse actions in ${file}`);
  const extra = source.match(/credentialFields:\s*([^,]+(?:,[\s\S]*?)?),\s*(?:errorsAsResults|defaultActions)/)?.[0] ?? '';
  const errors = source.match(/errorsAsResults:\s*(true|false)/)?.[0];
  const additions = [extra.startsWith('credentialFields') ? extra.replace(/,\s*(?:errorsAsResults|defaultActions)[\s\S]*/, '') + ',' : '', errors ? `${errors},` : ''].filter(Boolean).map((line) => `    ${line}`).join('\n');
  const generated = `${importLine}\nimport { createActivepiecesPiece, type PieceFactoryConfig } from "frogbot/pieces";\n\n${actionsBlock}\nexport const ${instance}Scopes = ${JSON.stringify(scopes, null, 2)} as const;\n\nexport function create${pascalCase(instance)}(config?: PieceFactoryConfig) {\n  const piece = createActivepiecesPiece({\n    module: ${moduleName},\n    service: ${JSON.stringify(service)},\n    credentialType: ${JSON.stringify(credentialType)},\n    defaultActions: ${actionsName},\n    scopes: ${instance}Scopes,\n    config,\n${additions ? `${additions}\n` : ''}  });\n  return Object.assign(piece, {\n${properties}\n  });\n}\n`;
  await writeFile(file, generated);
}
