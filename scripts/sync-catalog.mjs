import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { generateAIModelTypes } from './generate-ai-types.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const overlaysPath = resolve(root, 'scripts/model-catalog-overlays.json');
const catalogPath = resolve(root, 'packages/frogbot/src/ai/catalog.json');
const gatewayPath = resolve(root, 'packages/gateway/src/providers/catalog.data.ts');

const PROVIDERS = {
  'amazon-bedrock': 'amazon-bedrock',
  anthropic: 'anthropic',
  cerebras: 'cerebras',
  cohere: 'cohere',
  deepinfra: 'deepinfra',
  'fireworks-ai': 'fireworks',
  google: 'google',
  groq: 'groq',
  mistral: 'mistral',
  openai: 'openai',
  perplexity: 'perplexity',
  togetherai: 'togetherai',
  xai: 'xai',
};
const OVERLAY_PROVIDERS = new Set(['replicate', 'voyage']);

const MODALITIES = new Set(['text', 'image', 'audio', 'video', 'embedding']);

function modeFor(modalities) {
  if (modalities.output.includes('embedding')) return 'embedding';
  if (modalities.output.includes('image')) return 'image_generation';
  if (modalities.output.includes('video')) return 'video_generation';
  if (modalities.output.includes('audio')) return 'audio_speech';
  if (modalities.input.includes('audio')) return 'audio_transcription';
  return 'chat';
}

function operationsFor(modalities) {
  const operations = [];
  if (modalities.output.includes('text')) operations.push('chat.completions');
  if (modalities.output.includes('embedding')) operations.push('embeddings');
  if (modalities.output.includes('image')) operations.push('images.generations');
  if (modalities.output.includes('audio')) operations.push('audio.speech');
  if (modalities.input.includes('audio') && modalities.output.includes('text')) {
    operations.push('audio.transcriptions');
  }
  if (modalities.output.includes('video')) operations.push('video.generations');
  return operations;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function mapModel({ model, provider }) {
  const modalities = {
    input: model.modalities.input.filter((modality) => MODALITIES.has(modality)),
    output: model.modalities.output.filter((modality) => MODALITIES.has(modality)),
  };
  const capabilities = compact({
    toolCalling: model.tool_call || undefined,
    structuredOutput: model.structured_output || undefined,
    reasoning: model.reasoning || undefined,
    vision: modalities.input.includes('image') || undefined,
    promptCaching: model.cost?.cache_read !== undefined || undefined,
    streaming: modalities.output.includes('text') || undefined,
  });
  return compact({
    id: `${provider}/${model.id}`,
    name: model.name,
    created: model.release_date,
    knowledge: model.knowledge,
    status: model.status,
    modalities,
    operations: operationsFor(modalities),
    capabilities,
    context: { input: model.limit.context, output: model.limit.output },
    providers: [provider],
  });
}

export function buildCatalogs({ overlays, source }) {
  const gateway = [];
  for (const [sourceProvider, provider] of Object.entries(PROVIDERS)) {
    const models = source[sourceProvider]?.models ?? {};
    for (const model of Object.values(models)) {
      if (model.status !== 'deprecated') gateway.push(mapModel({ model, provider }));
    }
  }
  for (const overlay of overlays) {
    if (!OVERLAY_PROVIDERS.has(overlay.provider)) {
      throw new Error(`Unexpected model catalog overlay provider: ${overlay.provider}`);
    }
    const { mode: _mode, provider: _provider, ...entry } = overlay;
    gateway.push(entry);
  }
  gateway.sort((a, b) => a.id.localeCompare(b.id));
  const catalog = gateway
    .map((entry) => ({ id: entry.id, provider: entry.id.slice(0, entry.id.indexOf('/')), mode: modeFor(entry.modalities) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { catalog, gateway };
}

export function renderCatalog(catalog) {
  return `${JSON.stringify([...catalog].sort((a, b) => a.id.localeCompare(b.id)), null, 2)}\n`;
}

export function renderGatewayCatalog(gateway) {
  const entries = [...gateway]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, ...entry }) => `  model(${JSON.stringify(id)}, ${JSON.stringify(entry, null, 2).replaceAll('\n', '\n  ')}),`)
    .join('\n');
  return `import { defineModelCatalog, presetFor, type ModelCatalog } from './catalog.js';\n\nconst model = presetFor<string>();\n\nexport const DEFAULT_MODEL_CATALOG: ModelCatalog = defineModelCatalog(\n${entries}\n);\n`;
}

export async function syncCatalog({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl('https://models.dev/api.json');
  if (!response.ok) throw new Error(`models.dev request failed: ${response.status} ${response.statusText}`);
  const source = await response.json();
  const overlays = JSON.parse(await readFile(overlaysPath, 'utf8'));
  const { catalog, gateway } = buildCatalogs({ overlays, source });
  await writeFile(catalogPath, renderCatalog(catalog));
  await writeFile(gatewayPath, renderGatewayCatalog(gateway));
  await generateAIModelTypes();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await syncCatalog();
}
