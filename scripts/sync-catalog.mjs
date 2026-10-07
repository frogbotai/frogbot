import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { format, resolveConfig } from 'prettier';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const overlaysPath = resolve(root, 'scripts/model-catalog-overlays.json');
const catalogPath = resolve(root, 'packages/frogbot/src/ai/catalog.json');
const gatewayPath = resolve(root, 'packages/gateway/src/providers/catalog.data.ts');
const typesPath = resolve(root, 'packages/frogbot/src/ai/generated.ts');
const logosPath = resolve(root, 'packages/ui/src/chat/provider-logos.ts');
const logoProbe = 'frogbot-missing-provider-logo';

const PROVIDERS = {
  'amazon-bedrock': 'bedrock',
  anthropic: 'anthropic',
  cerebras: 'cerebras',
  cohere: 'cohere',
  deepinfra: 'deepinfra',
  'fireworks-ai': 'fireworks',
  google: 'google',
  groq: 'groq',
  mistral: 'mistral',
  openai: 'openai',
  openrouter: 'openrouter',
  perplexity: 'perplexity',
  togetherai: 'togetherai',
  vercel: 'vercel',
  xai: 'xai',
};

const SYNCED_PROVIDERS = new Set(Object.values(PROVIDERS));
const OVERLAY_PROVIDERS = new Set(['replicate', 'typesafe-ai', 'voyage']);
const AGGREGATOR_PROVIDERS = new Set(['openrouter', 'vercel']);

const MODALITIES = new Set(['text', 'image', 'audio', 'video', 'pdf', 'embedding']);
const GATEWAY_FIELDS = new Set([
  'id',
  'name',
  'created',
  'knowledge',
  'status',
  'modalities',
  'operations',
  'capabilities',
  'context',
  'cost',
  'sdk',
  'providers',
]);

function modeFor(operations, modalities) {
  if (operations.includes('evaluate')) return 'evaluate';

  if (operations.includes('rerank')) return 'rerank';

  if (modalities.output.includes('embedding')) return 'embedding';

  if (modalities.output.includes('image')) return 'image_generation';

  if (modalities.output.includes('video')) return 'video_generation';

  if (modalities.output.includes('audio')) return 'audio_speech';

  if (modalities.input.includes('text') && modalities.output.includes('text')) return 'chat';

  if (modalities.input.includes('audio')) return 'audio_transcription';

  return 'chat';
}

function operationsFor(modalities) {
  const operations = [];
  if (modalities.output.includes('text')) operations.push('chat.completions');
  if (modalities.output.includes('embedding')) operations.push('embeddings');
  if (modalities.output.includes('image')) {
    operations.push('images.generations');
  }

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

function tokenLimit(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function reasoningOption(option) {
  if (option?.type === 'toggle') return { type: 'toggle' };

  if (option?.type === 'budget_tokens') {
    return compact({
      type: 'budget_tokens',
      min: tokenLimit(option.min),
      max: tokenLimit(option.max),
    });
  }

  if (option?.type !== 'effort') return undefined;

  if (!Array.isArray(option.values)) return { type: 'effort' };

  const values = option.values.filter((value) => typeof value === 'string' && value !== 'null');

  return { type: 'effort', values };
}

function reasoningOptionsFor(options) {
  if (!Array.isArray(options)) return undefined;

  const normalized = options.map(reasoningOption).filter((option) => option !== undefined);

  return normalized.length > 0 ? normalized : undefined;
}

function isPricedLanguageModel(model) {
  const priced = model.cost !== undefined;
  const textOnly = model.modalities.output.every((modality) => modality === 'text');

  return priced && textOnly;
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
    reasoningOptions: reasoningOptionsFor(model.reasoning_options),
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
    cost: model.cost
      ? compact({
          input: model.cost.input,
          output: model.cost.output,
          cache_read: model.cost.cache_read,
          cache_write: model.cost.cache_write,
        })
      : undefined,
    sdk: model.provider
      ? compact({
          npm: model.provider.npm,
          api: model.provider.api,
          shape: model.provider.shape,
        })
      : undefined,
    providers: [provider],
  });
}

export function buildCatalogs({ overlays, source }) {
  const entries = new Map();
  const sourceIds = new Set();
  const families = new Map();
  const corrected = new Set();

  for (const [sourceProvider, provider] of Object.entries(PROVIDERS)) {
    const models = source[sourceProvider]?.models ?? {};

    for (const model of Object.values(models)) {
      sourceIds.add(`${provider}/${model.id}`);

      if (model.status === 'deprecated') continue;

      if (AGGREGATOR_PROVIDERS.has(provider) && !isPricedLanguageModel(model)) continue;

      const entry = mapModel({ model, provider });

      entries.set(entry.id, entry);
      families.set(entry.id, model.family);
    }
  }

  for (const [provider, { exclude = [] }] of Object.entries(overlays)) {
    if (!SYNCED_PROVIDERS.has(provider) && !OVERLAY_PROVIDERS.has(provider)) {
      throw new Error(`Unexpected model catalog overlay provider: ${provider}`);
    }

    for (const modelId of exclude) {
      const id = `${provider}/${modelId}`;

      if (!sourceIds.has(id)) {
        throw new Error(
          `Model catalog exclude '${id}' for provider '${provider}' is missing from the source`,
        );
      }

      entries.delete(id);
    }
  }

  for (const [provider, { add = [], correct = [], exclude = [] }] of Object.entries(overlays)) {
    for (const correction of correct) {
      const { id } = correction;
      const label = `Model catalog correction '${id}' for provider '${provider}'`;

      if (typeof id !== 'string' || !id.startsWith(`${provider}/`)) {
        throw new Error(`${label} has a mismatched provider prefix`);
      }

      if (add.some((entry) => entry.id === id) || exclude.includes(id.slice(provider.length + 1))) {
        throw new Error(`${label} is also listed in add or exclude`);
      }

      const invalidField = Object.keys(correction).find((field) => !GATEWAY_FIELDS.has(field));

      if (invalidField !== undefined) {
        throw new Error(`${label} sets forbidden field '${invalidField}'`);
      }

      if (!entries.has(id)) {
        throw new Error(`${label} is missing from the synced output`);
      }

      entries.set(id, { ...entries.get(id), ...correction });
      corrected.add(id);
    }
  }

  for (const [, { add = [] }] of Object.entries(overlays)) {
    for (const overlay of add) {
      const { mode: _mode, ...entry } = overlay;

      entries.set(entry.id, entry);
    }
  }

  const gateway = [...entries.values()];

  gateway.sort((a, b) => a.id.localeCompare(b.id));

  const catalog = gateway
    .map((entry) => ({
      id: entry.id,
      provider: entry.id.slice(0, entry.id.indexOf('/')),
      mode: modeFor(entry.operations, entry.modalities),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const entry of catalog) {
    const embeddingName = /embed/i.test(entry.id) || /embed/i.test(families.get(entry.id) ?? '');

    if (entry.mode === 'chat' && embeddingName && !corrected.has(entry.id)) {
      console.warn(
        `Review model catalog entry '${entry.id}': chat mode with 'embed' in its ID or family and no correction`,
      );
    }
  }

  return { catalog, gateway };
}

export function renderCatalog(catalog) {
  return `${JSON.stringify(
    [...catalog].sort((a, b) => a.id.localeCompare(b.id)),
    null,
    2,
  )}\n`;
}

export function renderGatewayCatalog(gateway) {
  const entries = [...gateway]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      ({ id, ...entry }) =>
        `  model(${JSON.stringify(id)}, ${JSON.stringify(entry, null, 2).replaceAll('\n', '\n  ')}),`,
    )
    .join('\n');

  return `import { defineModelCatalog, presetFor, type ModelCatalog } from './catalog.js';\n\nconst model = presetFor<string>();\n\nexport const DEFAULT_MODEL_CATALOG: ModelCatalog = defineModelCatalog(\n${entries}\n);\n`;
}

function typeName(provider) {
  return provider
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => {
      if (part === 'openai') return 'OpenAI';
      if (part === 'xai') return 'XAI';
      if (part === 'togetherai') return 'TogetherAI';

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

export async function renderAIModelTypes(catalog) {
  const providers = [...new Set(catalog.map((entry) => entry.provider))].sort();
  const sections = providers.map((provider) => {
    const ids = catalog
      .filter((entry) => entry.provider === provider)
      .map((entry) => entry.id)
      .sort();

    return `export type ${typeName(provider)}ModelId =\n${union(ids)};`;
  });

  const combined = providers.map((provider) => `${typeName(provider)}ModelId`);
  const source = `export type ProviderSlug =\n${union(providers)};\n\n${sections.join('\n\n')}\n\nexport type CatalogModelId =\n${typeUnion(combined)};\n`;
  const options = (await resolveConfig(typesPath)) ?? {};

  return format(source, { ...options, filepath: typesPath, parser: 'typescript' });
}

function logoAttributes(source) {
  const attributes = {};
  const pattern = /\s+([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
  let offset = 0;

  while (source.slice(offset).trim()) {
    pattern.lastIndex = offset;

    const match = pattern.exec(source);

    if (!match) throw new Error('Malformed SVG attributes');

    const [, name, doubleQuoted, singleQuoted] = match;

    if (Object.hasOwn(attributes, name)) throw new Error(`Duplicate SVG attribute: ${name}`);

    attributes[name] = doubleQuoted ?? singleQuoted;
    offset = pattern.lastIndex;
  }

  return attributes;
}

export function logoNodes(svg) {
  const root = svg.match(/^\s*<svg\b([^<>]*)>([\s\S]*)<\/svg>\s*$/);

  if (!root) throw new Error('Expected an SVG root');

  const { viewBox } = logoAttributes(root[1]);

  if (!viewBox?.trim()) throw new Error('Missing SVG viewBox');

  const allowed = {
    d: 'd',
    fill: 'fill',
    'fill-rule': 'fillRule',
    'clip-rule': 'clipRule',
    opacity: 'opacity',
  };

  const nodes = [];
  let remaining = root[2].trim();

  while (remaining) {
    const element = remaining.match(/^<([\w:.-]+)\b([^<>]*?)(\/?)>/);

    if (!element) throw new Error('Malformed SVG content');

    const [, name, source, selfClosing] = element;

    if (name !== 'path') throw new Error(`Unsupported SVG element: ${name}`);

    const attributes = logoAttributes(source);

    if (!attributes.d?.trim()) throw new Error('Missing SVG path d');

    const unsafe = Object.keys(allowed).find((attribute) =>
      /[()\\]/.test(attributes[attribute] ?? ''),
    );

    if (unsafe) throw new Error(`Unsupported SVG attribute value: ${unsafe}`);

    nodes.push([
      'path',
      Object.fromEntries(
        Object.entries(allowed)
          .filter(([attribute]) => Object.hasOwn(attributes, attribute))
          .map(([attribute, prop]) => [prop, attributes[attribute]]),
      ),
    ]);

    remaining = remaining.slice(element[0].length).trim();

    if (!selfClosing) {
      if (!remaining.startsWith('</path>')) throw new Error('Expected SVG path closing tag');

      remaining = remaining.slice('</path>'.length).trim();
    }
  }

  return { viewBox, nodes };
}

export async function renderProviderLogos(logos) {
  const sorted = Object.fromEntries(Object.entries(logos).sort(([a], [b]) => a.localeCompare(b)));
  const source = `import type { IconNode } from '../icons/types.js';\n\nexport const providerLogos: Record<string, { viewBox: string; nodes: IconNode }> = ${JSON.stringify(sorted, null, 2)};\n`;
  const options = (await resolveConfig(logosPath)) ?? {};

  return format(source, { ...options, filepath: logosPath, parser: 'typescript' });
}

async function fetchLogo({ fetchImpl, provider }) {
  try {
    const response = await fetchImpl(`https://models.dev/logos/${provider}.svg`, {
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 404) return undefined;

    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    return await response.text();
  } catch (error) {
    throw new Error(`models.dev logo request for '${provider}' failed: ${error.message}`, {
      cause: error,
    });
  }
}

export async function syncCatalog({ fetchImpl = fetch } = {}) {
  let response;

  try {
    response = await fetchImpl('https://models.dev/api.json', {
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`models.dev catalog request failed: ${error.message}`, { cause: error });
  }

  if (!response.ok) {
    throw new Error(`models.dev request failed: ${response.status} ${response.statusText}`);
  }

  const source = await response.json();
  const overlays = JSON.parse(await readFile(overlaysPath, 'utf8'));
  const { catalog, gateway } = buildCatalogs({ overlays, source });
  const generic = await fetchLogo({ fetchImpl, provider: logoProbe });

  const logos = {};

  for (const [sourceProvider, provider] of Object.entries(PROVIDERS)) {
    if (!Object.hasOwn(source, sourceProvider)) continue;

    const svg = await fetchLogo({ fetchImpl, provider: sourceProvider });

    if (svg === undefined || svg === generic) continue;

    try {
      logos[provider] = logoNodes(svg);
    } catch (error) {
      throw new Error(`Invalid models.dev logo for '${sourceProvider}': ${error.message}`, {
        cause: error,
      });
    }
  }

  const outputs = [
    [catalogPath, renderCatalog(catalog)],
    [gatewayPath, renderGatewayCatalog(gateway)],
    [typesPath, await renderAIModelTypes(catalog)],
    [logosPath, await renderProviderLogos(logos)],
  ];

  for (const [path, content] of outputs) {
    await writeFile(path, content);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await syncCatalog();
}
