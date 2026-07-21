#!/usr/bin/env node
// CLI entry — `bunx @frogbotai/gateway` (or `npx`).
//
// Reads environment variables to assemble a gateway config, then starts a
// Hono server on the configured port.
//
// Per-provider env var conventions live on each provider definition's
// `fromEnv()` (see `providers/<name>/index.ts`). The CLI is provider-agnostic:
// it iterates the registry and asks each provider to build itself from env.
// Adding a new provider requires zero changes here.
//
// Flags:
//   --config <path>   load an explicit config at the env-explicit layer
//   --port <port>     bind port
//   --quiet           suppress startup banner
//   --help            print usage
//
// Infra env vars (owned by the CLI itself):
//   PORT  → bind port (default 3939)
//   HOST  → bind host (default 0.0.0.0)

import { serve, type ServerType } from '@hono/node-server';
import { pathToFileURL } from 'node:url';

import { createGateway } from '../gateway.js';
import { loadLayeredConfig } from '../config/layered.js';
import { finalizeConfig } from '../config/parse.js';
import type { GatewayConfig } from '../config/schema.js';
import { PROVIDER_NAMES, providers, type ProviderConfigMap } from '../providers/registry.js';
import { helpText, parseCliArgs, parsePort } from './args.js';
import { startupBanner } from './banner.js';

const DEFAULT_PORT = 3939;
const DEFAULT_HOST = '0.0.0.0';

// Max time to wait for in-flight requests to drain before forcing exit. Kept
// under the Kubernetes default `terminationGracePeriodSeconds` (30s) so the
// exporter flush and a hard-kill buffer fit inside the grace window.
const DRAIN_TIMEOUT_MS = 25_000;

export type GracefulShutdownDeps = {
  /** HTTP server whose `.close()` stops accepting new connections and drains in-flight ones. */
  server: Pick<ServerType, 'close'>;
  /** Optional flush hook (e.g. OTel exporter shutdown) run after connections drain. */
  flush?: () => Promise<void>;
  /** Force-exit deadline if the drain never completes. Default 25s. */
  drainTimeoutMs?: number;
  exit?: (code: number) => never;
  log?: (message: string) => void;
  errorLog?: (message: string) => void;
};

/**
 * Register SIGTERM/SIGINT handlers that stop accepting new connections, drain
 * in-flight requests, flush the exporter, then exit — instead of dropping
 * long-lived SSE streams mid-frame on deploy/scale-down. A hard timeout forces
 * exit if the drain wedges. Exported (with injectable deps) for testing.
 */
export function installGracefulShutdown(deps: GracefulShutdownDeps): (signal: string) => void {
  const drainTimeoutMs = deps.drainTimeoutMs ?? DRAIN_TIMEOUT_MS;
  const exit = deps.exit ?? ((code: number): never => process.exit(code));
  const log = deps.log ?? ((message: string) => console.log(message));
  const errorLog = deps.errorLog ?? ((message: string) => console.error(message));

  const handler = (signal: string): void => {
    log(`${signal} received, draining connections...`);
    const timer = setTimeout(() => {
      errorLog('drain timeout, forcing exit');
      exit(1);
    }, drainTimeoutMs);
    timer.unref?.();

    deps.server.close((err) => {
      clearTimeout(timer);
      if (err) {
        errorLog(err.message);
        exit(1);
        return;
      }
      void (async () => {
        if (deps.flush) {
          await deps.flush();
        }
        exit(0);
      })();
    });
  };

  process.once('SIGTERM', () => handler('SIGTERM'));
  process.once('SIGINT', () => handler('SIGINT'));
  return handler;
}

function buildProvidersFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderConfigMap {
  const out: ProviderConfigMap = {};
  for (const name of PROVIDER_NAMES) {
    try {
      const cfg = providers[name].fromEnv(env);
      if (cfg) {
        (out as Record<string, unknown>)[name] = cfg;
      }
    } catch (error) {
      // Discovery must never abort boot (G41): a mis-set provider env should
      // skip that provider, not take down the ones that are configured.
      console.warn(
        JSON.stringify({
          type: 'provider-discovery-skipped',
          provider: name,
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
  return out;
}

function missingProvidersMessage(): string {
  const vars = PROVIDER_NAMES.map((name) => providers[name].envVars[0]).join(', ');
  return `no providers configured; set OPENAI_API_KEY or add openai to gateway.config.ts -> providers (known env vars: ${vars})`;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    return;
  }

  const envConfig: GatewayConfig = { providers: buildProvidersFromEnv() };
  const { config: merged, sources } = await loadLayeredConfig({
    defaults: envConfig,
    configPath: args.configPath,
  });

  const configured = [
    ...Object.keys(merged.providers).filter((k) => merged.providers[k as keyof ProviderConfigMap] != null),
    ...(merged.openaiCompatible ?? []).map((e) => e.name),
  ];
  if (configured.length === 0) {
    console.error(missingProvidersMessage());
    process.exit(1);
  }

  const port = args.port ?? parsePort(process.env.PORT) ?? DEFAULT_PORT;
  const host = process.env.HOST ?? DEFAULT_HOST;

  const finalized = finalizeConfig(merged);

  let flushTracing: (() => Promise<void>) | undefined;
  if (
    finalized.tracing?.endpoint ??
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
  ) {
    const { setupTracing } = await import('../observability/setup.js').catch((err: unknown) => {
      const cause = err instanceof Error ? err.message : String(err);
      throw new Error(
        `tracing endpoint configured but the OpenTelemetry setup module failed to load — install the optional @opentelemetry/* peer dependencies of @frogbotai/gateway (${cause})`,
      );
    });
    flushTracing = setupTracing({ endpoint: finalized.tracing?.endpoint });
  }

  const gw = createGateway(finalized);

  if (!args.quiet) {
    console.log(startupBanner({ config: finalized, host, port, sources }));
  }

  const server = serve(
    {
      fetch: (request: Request) => gw.handler(request),
      port,
      hostname: host,
    },
    (info) => {
      const displayHost = info.address === '0.0.0.0' || info.address === '::' ? 'localhost' : info.address;
      console.log(`listening on http://${displayHost}:${info.port}`);
    },
  );

  installGracefulShutdown({ server, flush: flushTracing });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
