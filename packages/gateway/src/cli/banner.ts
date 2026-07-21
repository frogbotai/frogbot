import type { ConfigSource } from '../config/layered.js';
import type { GatewayConfig } from '../config/schema.js';
import type { Hooks } from '../hooks.js';
import type { GatewayLogger, LoggerOptions } from '../observability/logger.js';
import type { ProviderConfigMap } from '../providers/registry.js';

export type StartupBannerArgs = {
  config: GatewayConfig;
  host: string;
  port: number;
  sources: ConfigSource[];
};

const hookSlots = ['beforeOperation', 'beforeUpstream', 'afterUpstream', 'afterError', 'afterOperation'] as const;

const loggerLevel = (logger: GatewayLogger | LoggerOptions | undefined): string | undefined =>
  logger && 'level' in logger && typeof logger.level === 'string' ? logger.level : undefined;

export function startupBanner(args: StartupBannerArgs): string {
  const providers = configuredProviders(args.config);
  const hooks = hookSummary(args.config.hooks);
  return [
    'Frogbot Gateway',
    `listen: http://${displayHost(args.host)}:${args.port}`,
    `providers: ${providers.length ? providers.map((name) => `${name} (catalog unknown)`).join(', ') : 'none'}`,
    `modalities: ${modalities(args.config).join(', ')}`,
    `hooks: ${hooks.length ? hooks.join(', ') : 'none'}`,
    `logger: ${loggerLevel(args.config.logger) ?? process.env.LOG_LEVEL ?? 'info'}`,
    `tracing: ${args.config.tracing?.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'off'}`,
    `config sources: ${args.sources.map(formatSource).join(', ')}`,
  ].join('\n');
}

function configuredProviders(config: GatewayConfig): string[] {
  return Object.keys(config.providers).filter(
    (key) => config.providers[key as keyof ProviderConfigMap] != null,
  );
}

function modalities(config: GatewayConfig): string[] {
  const names = new Set(configuredProviders(config));
  const out = ['chat', 'embeddings', 'images', 'audio', 'video', 'rerank'];
  if (names.size === 0) return ['none'];
  return out;
}

function hookSummary(hooks: Hooks | undefined): string[] {
  if (!hooks) return [];
  return hookSlots.flatMap((slot) => {
    const count = hooks[slot]?.length ?? 0;
    return count > 0 ? [`${slot}:${count}`] : [];
  });
}

function formatSource(source: ConfigSource): string {
  return source.path ? `${source.kind}=${source.path}` : source.kind;
}

function displayHost(host: string): string {
  return host === '0.0.0.0' || host === '::' ? 'localhost' : host;
}
