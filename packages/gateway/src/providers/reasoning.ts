import type { JSONObject, SharedV4ProviderOptions } from '@ai-sdk/provider';

import { DEFAULT_MODEL_CATALOG } from './catalog.data.js';
import type { ModelReasoningOption } from './catalog.js';
import { isVertexAnthropicModel } from './vertex/models.js';

export type ReasoningVariant = {
  key: string;
  label: string;
  providerOptions: SharedV4ProviderOptions;
};

export type ResolveReasoningVariantsArgs = {
  modelId: string;
  options: readonly ModelReasoningOption[] | undefined;
  outputLimit?: number;
  providerOptionsName?: string;
};

type ReasoningModel = { id: string; outputLimit?: number };

type ReasoningPreset = { key: string; settings: JSONObject; tokens?: number };

type ReasoningProtocol = (model: ReasoningModel, option: ModelReasoningOption) => ReasoningPreset[];

type BudgetOption = Extract<ModelReasoningOption, { type: 'budget_tokens' }>;

const EFFORTS = ['low', 'medium', 'high'];
const MAX_EFFORTS = [...EFFORTS, 'xhigh', 'max'];
const ADAPTIVE_THINKING = { type: 'adaptive', display: 'summarized' };
const ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'thinking'];
const LABELS: Record<string, string> = { none: 'Off', xhigh: 'Extra High', thinking: 'On' };

function effortPresets(args: {
  values: readonly string[];
  accepted?: readonly string[];
  settings: (effort: string) => JSONObject;
}): ReasoningPreset[] {
  return args.values
    .filter((effort) => effort !== 'default' && (args.accepted?.includes(effort) ?? true))
    .map((effort) => ({ key: effort, settings: args.settings(effort) }));
}

function togglePresets(off: JSONObject, on: JSONObject): ReasoningPreset[] {
  return [
    { key: 'none', settings: off },
    { key: 'thinking', settings: on },
  ];
}

function budgetCeiling(model: ReasoningModel): number {
  return model.outputLimit === undefined ? Infinity : Math.floor(model.outputLimit / 2);
}

function budgetPresets(
  model: ReasoningModel,
  option: BudgetOption,
  settings: (tokens: number) => JSONObject,
): ReasoningPreset[] {
  const ceiling = budgetCeiling(model);
  const maximum = Math.min(option.max ?? ceiling, ceiling);

  if (!Number.isFinite(maximum) || maximum <= 0 || maximum < (option.min ?? 0)) return [];

  const high = Math.max(option.min ?? 0, Math.floor((maximum + 1) / 2));
  const presets = [{ key: 'high', settings: settings(high), tokens: high }];

  if (maximum <= high) return presets;

  return [...presets, { key: 'max', settings: settings(maximum), tokens: maximum }];
}

function claudeInfo(id: string) {
  const familyFirst = /(?:claude-)?(opus|sonnet|haiku|fable|mythos)-(\d+)(?:[.-](\d+))?/i.exec(id);
  const versionFirst = /claude-(\d+)(?:[.-](\d+))?-(opus|sonnet|haiku|fable|mythos)/i.exec(id);
  const family = (familyFirst?.[1] ?? versionFirst?.[3])?.toLowerCase();
  const major = Number(familyFirst?.[2] ?? versionFirst?.[1]);
  const minor = Number(familyFirst?.[3] ?? versionFirst?.[2] ?? 0);

  return {
    family,
    major,
    minor,
    manual: (major === 3 && minor === 7) || (major === 4 && minor < 6),
    always:
      family === 'fable' || family === 'mythos' || id.toLowerCase().includes('mythos-preview'),
  };
}

function manualThinking(model: ReasoningModel): JSONObject | undefined {
  const tokens = Math.min(16_000, budgetCeiling(model));

  if (tokens < 1024) return undefined;

  return { type: 'enabled', budgetTokens: tokens };
}

function openaiChat(args: { key?: string; accepted?: readonly string[] } = {}): ReasoningProtocol {
  return (_, option) => {
    if (option.type !== 'effort') return [];

    return effortPresets({
      values: option.values ?? EFFORTS,
      accepted: args.accepted,
      settings: (effort) => ({ [args.key ?? 'reasoningEffort']: effort }),
    });
  };
}

const openaiResponses: ReasoningProtocol = (_, option) => {
  if (option.type !== 'effort') return [];

  return effortPresets({
    values: option.values ?? ['none', 'minimal', ...EFFORTS, 'xhigh'],
    settings: (effort) => ({
      reasoningEffort: effort,
      reasoningSummary: 'auto',
      include: ['reasoning.encrypted_content'],
      forceReasoning: true,
    }),
  });
};

const anthropicMessages: ReasoningProtocol = (model, option) => {
  const claude = claudeInfo(model.id);

  if (option.type === 'budget_tokens') {
    return budgetPresets(model, option, (tokens) => ({
      thinking: { type: 'enabled', budgetTokens: tokens },
    }));
  }

  if (option.type === 'toggle') {
    const thinking = claude.manual ? manualThinking(model) : ADAPTIVE_THINKING;

    if (claude.always || !thinking) return [];

    return togglePresets({ thinking: { type: 'disabled' } }, { thinking });
  }

  const opus45 = claude.family === 'opus' && claude.major === 4 && claude.minor === 5;

  if (claude.manual && !opus45) {
    return anthropicMessages(model, { type: 'budget_tokens', min: 1024 });
  }

  const thinking = opus45 ? manualThinking(model) : ADAPTIVE_THINKING;

  if (!thinking) return [];

  const defaults = claude.major === 4 && claude.minor === 6 ? [...EFFORTS, 'max'] : MAX_EFFORTS;

  return effortPresets({
    values: option.values ?? defaults,
    accepted: MAX_EFFORTS,
    settings: (effort) => ({ thinking, effort }),
  });
};

const gemini: ReasoningProtocol = (model, option) => {
  if (option.type === 'toggle') {
    return togglePresets(
      { thinkingConfig: { includeThoughts: false, thinkingBudget: 0 } },
      { thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } },
    );
  }

  if (option.type === 'budget_tokens') {
    return budgetPresets(model, option, (tokens) => ({
      thinkingConfig: { includeThoughts: true, thinkingBudget: tokens },
    }));
  }

  return effortPresets({
    values: option.values ?? EFFORTS,
    accepted: ['minimal', ...EFFORTS],
    settings: (level) => ({ thinkingConfig: { includeThoughts: true, thinkingLevel: level } }),
  });
};

const bedrockConverse: ReasoningProtocol = (model, option) => {
  const claude = model.id.includes('anthropic');
  const fields = (additionalModelRequestFields: JSONObject) => ({ additionalModelRequestFields });

  if (option.type === 'toggle') {
    return claude
      ? togglePresets(
          fields({ thinking: { type: 'disabled' } }),
          fields({ thinking: ADAPTIVE_THINKING }),
        )
      : togglePresets(
          fields({ reasoningConfig: { type: 'disabled' } }),
          fields({ reasoningConfig: { type: 'enabled' } }),
        );
  }

  if (option.type === 'budget_tokens') {
    return budgetPresets(model, option, (tokens) => {
      const reasoningConfig = { type: 'enabled', budgetTokens: tokens };

      return claude ? { reasoningConfig } : fields({ reasoningConfig });
    });
  }

  const thinking = claude && !claudeInfo(model.id).manual ? ADAPTIVE_THINKING : {};
  const gpt = model.id.includes('openai.gpt-') && !model.id.includes('gpt-oss');

  return effortPresets({
    values: option.values ?? EFFORTS,
    accepted: gpt ? ['none', ...MAX_EFFORTS] : MAX_EFFORTS,
    settings: (effort) => {
      if (effort === 'none') return fields({ reasoning: { effort } });

      return {
        reasoningConfig: claude
          ? { ...thinking, maxReasoningEffort: effort }
          : { type: 'enabled', maxReasoningEffort: effort },
      };
    },
  });
};

const cohere: ReasoningProtocol = (model, option) => {
  if (option.type === 'toggle') {
    return togglePresets({ thinking: { type: 'disabled' } }, { thinking: { type: 'enabled' } });
  }

  if (option.type === 'budget_tokens') {
    return budgetPresets(model, option, (tokens) => ({
      thinking: { type: 'enabled', tokenBudget: tokens },
    }));
  }

  return [];
};

const deepinfraChat: ReasoningProtocol = (model, option) => {
  if (/kimi[-.]?k2[.-]7-code/i.test(model.id)) return [];

  if (option.type === 'toggle') {
    return togglePresets({ reasoning: { enabled: false } }, { reasoning: { enabled: true } });
  }

  return openaiChat()(model, option);
};

const mistralChat: ReasoningProtocol = (model, option) => {
  if (model.id === 'zai-glm-5-3') return [];

  return openaiChat({ accepted: ['none', 'high'] })(model, option);
};

const PROTOCOLS = new Map<string, ReasoningProtocol>([
  ['anthropic', anthropicMessages],
  ['bedrock', bedrockConverse],
  ['cerebras', openaiChat()],
  ['cohere', cohere],
  ['deepinfra', deepinfraChat],
  ['fireworks', openaiChat({ accepted: ['none', ...EFFORTS, 'max'] })],
  ['google', gemini],
  ['groq', openaiChat({ accepted: ['none', ...EFFORTS] })],
  ['mistral', mistralChat],
  ['openai', openaiResponses],
  ['perplexity', openaiChat({ key: 'reasoning_effort', accepted: ['minimal', ...EFFORTS] })],
  ['togetherai', openaiChat()],
  ['xai', openaiChat({ accepted: ['none', ...EFFORTS, 'xhigh'] })],
]);

function reasoningTarget(args: ResolveReasoningVariantsArgs) {
  const slash = args.modelId.indexOf('/');

  if (slash <= 0) return undefined;

  const provider = args.modelId.slice(0, slash);
  const id = args.modelId.slice(slash + 1);

  if (args.providerOptionsName) {
    return { id, namespace: args.providerOptionsName, protocol: openaiChat() };
  }

  const sdk = DEFAULT_MODEL_CATALOG.get(args.modelId)?.sdk;

  if (provider === 'bedrock' && sdk?.npm === '@ai-sdk/amazon-bedrock/mantle') {
    return { id, namespace: 'openai', protocol: openaiResponses };
  }

  if (provider === 'vertex') {
    return isVertexAnthropicModel(args.modelId)
      ? { id, namespace: 'anthropic', protocol: anthropicMessages }
      : { id, namespace: 'vertex', protocol: gemini };
  }

  const protocol = PROTOCOLS.get(provider);

  return protocol && { id, namespace: provider, protocol };
}

function rank(key: string): number {
  const index = ORDER.indexOf(key);

  return index === -1 ? ORDER.length : index;
}

function formatTokens(tokens: number): string {
  return tokens < 1000 ? String(tokens) : `${Math.round(tokens / 1000)}k`;
}

function reasoningLabel(preset: ReasoningPreset): string {
  const name = LABELS[preset.key] ?? `${preset.key.charAt(0).toUpperCase()}${preset.key.slice(1)}`;

  return preset.tokens === undefined ? name : `${name} · ${formatTokens(preset.tokens)}`;
}

export function resolveReasoningVariants(args: ResolveReasoningVariantsArgs): ReasoningVariant[] {
  const target = reasoningTarget(args);
  const options = args.options ?? [];

  if (!target || options.length === 0) return [];

  const model = { id: target.id, outputLimit: args.outputLimit };
  const effort = options.find((option) => option.type === 'effort');
  const budget = options.find((option) => option.type === 'budget_tokens');

  const toggle = options.some((option) => option.type === 'toggle')
    ? target.protocol(model, { type: 'toggle' })
    : [];

  const main = effort
    ? target.protocol(model, effort)
    : budget
      ? target.protocol(model, budget)
      : toggle;

  const presets = [...toggle.filter((preset) => preset.key === 'none'), ...main]
    .filter((preset, index, all) => all.findIndex((other) => other.key === preset.key) === index)
    .sort((a, b) => rank(a.key) - rank(b.key));

  return presets.map((preset) => ({
    key: preset.key,
    label: reasoningLabel(preset),
    providerOptions: { [target.namespace]: structuredClone(preset.settings) },
  }));
}
