import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(root, 'packages/frogbot/src/ai/catalog.json');
const outputPath = resolve(root, 'packages/frogbot/src/ai/generated.ts');

function typeName(provider) {
  return provider
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => {
      if (part === 'openai') return 'OpenAI';
      if (part === 'xai') return 'XAI';
      if (part === 'togetherai') return 'Together';
      return `${part[0].toUpperCase()}${part.slice(1)}`;
    })
    .join('');
}

function union(values, indent = '  ') {
  return values.map((value) => `${indent}| '${value}'`).join('\n');
}

function typeUnion(values, indent = '  ') {
  return values.map((value) => `${indent}| ${value}`).join('\n');
}

export function renderAIModelTypes(catalog) {
  const providers = [...new Set(catalog.map((entry) => entry.provider))].sort();
  const sections = providers.map((provider) => {
    const ids = catalog
      .filter((entry) => entry.provider === provider)
      .map((entry) => entry.id)
      .sort();
    return `export type ${typeName(provider)}ModelId =\n${union(ids)};`;
  });
  const combined = providers.map((provider) => `${typeName(provider)}ModelId`);

  return `export type ProviderSlug =\n${union(providers)};\n\n${sections.join('\n\n')}\n\nexport type CatalogModelId =\n${typeUnion(combined)};\n`;
}

export async function generateAIModelTypes() {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  await writeFile(outputPath, renderAIModelTypes(catalog));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await generateAIModelTypes();
}
