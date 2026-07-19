// Gateway E2E — deep scenarios per matrix provider, against REAL upstreams.
//
// The matrix suite (matrix.e2e.spec.ts) proves every provider × route × wire
// answers at all; THIS suite pushes each chat-capable provider through the
// behaviors real clients depend on:
//
//   - tool round trip on all three wires (request → tool_call → result → answer)
//   - streaming tool-call delta coalescing
//   - parallel tool calls
//   - multi-turn recall through history translation
//   - truncation semantics (finish_reason=length / stop_reason=max_tokens / incomplete)
//   - wire-correct error envelopes for bogus models
//   - mid-stream client abort (app must not wedge)
//   - oversized prompt → valid envelope, never a hang
//     (fill test/gateway/live/fixtures/huge-prompt.txt to enable; empty = skip)
//
// One scenario model per provider (`scenario.model` in matrix.ts, defaults to
// text[0]). Key-gated and filterable exactly like the matrix suite:
//   RUN_E2E=1 pnpm vitest run --project=gateway-e2e test/gateway/live/scenarios.e2e.spec.ts
//   E2E_TIER / E2E_PROVIDERS apply; E2E_ROUTES does not (scenarios span wires).

import { readFileSync } from 'node:fs';

import { describe, it } from 'vitest';

import { LIVE_MATRIX, type LiveProviderEntry } from './matrix.js';
import { makeLiveApp, type LiveApp } from './routes.js';
import {
  runChatErrorEnvelope,
  runChatHugePrompt,
  runChatMultiTurn,
  runChatParallelToolCalls,
  runChatStreamAbort,
  runChatStreamingToolCall,
  runChatToolRoundTrip,
  runChatTruncation,
  runMessagesErrorEnvelope,
  runMessagesMultiTurn,
  runMessagesToolRoundTrip,
  runMessagesTruncation,
  runResponsesErrorEnvelope,
  runResponsesMultiTurn,
  runResponsesToolRoundTrip,
  runResponsesTruncation,
} from './scenarios.js';

const RUN_E2E = process.env.RUN_E2E === '1';
const TEST_TIMEOUT = 180_000;

function csvFilter(envVar: string): Set<string> | undefined {
  const raw = process.env[envVar];
  if (!raw) {
    return undefined;
  }
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

const tierFilter = process.env.E2E_TIER;
const providerFilter = csvFilter('E2E_PROVIDERS');

function entryEnabled(entry: LiveProviderEntry): boolean {
  if (!RUN_E2E) {
    return false;
  }
  if (!entry.text?.length) {
    return false;
  }
  if (entry.envKey && !process.env[entry.envKey]) {
    return false;
  }
  if (tierFilter && entry.tier !== tierFilter) {
    return false;
  }
  if (providerFilter && !providerFilter.has(entry.label)) {
    return false;
  }
  return true;
}

// Oversized-prompt fixture — YOU fill this in (not committed content):
//   test/gateway/live/fixtures/huge-prompt.txt
let hugePrompt = '';
try {
  hugePrompt = readFileSync(new URL('./fixtures/huge-prompt.txt', import.meta.url), 'utf8').trim();
} catch {
  // fixture absent — huge-prompt scenario skips
}

for (const entry of LIVE_MATRIX) {
  const enabled = entryEnabled(entry);
  const scenarioModel = entry.scenario?.model ?? entry.text?.[0] ?? '';
  const model = `${entry.label}/${scenarioModel}`;
  const toolsCapable = entry.scenario?.tools !== false;

  describe.skipIf(!enabled)(`live scenarios — ${entry.label} (${scenarioModel})`, () => {
    let app: LiveApp | undefined;
    const getApp = () => (app ??= makeLiveApp(entry));

    describe.skipIf(!toolsCapable)('tool round trips', () => {
      it('chat wire: tool_call → tool result → final answer', () => runChatToolRoundTrip(getApp(), model), TEST_TIMEOUT);
      it('messages wire: tool_use → tool_result → final answer', () => runMessagesToolRoundTrip(getApp(), model), TEST_TIMEOUT);
      it('responses wire: function_call → function_call_output → final answer (G3)', () => runResponsesToolRoundTrip(getApp(), model), TEST_TIMEOUT);
      it('chat wire streaming: tool-call deltas coalesce', () => runChatStreamingToolCall(getApp(), model), TEST_TIMEOUT);
      it('chat wire: parallel tool calls have unique ids', () => runChatParallelToolCalls(getApp(), model), TEST_TIMEOUT);
    });

    describe('multi-turn recall', () => {
      it('chat wire', () => runChatMultiTurn(getApp(), model), TEST_TIMEOUT);
      it('messages wire', () => runMessagesMultiTurn(getApp(), model), TEST_TIMEOUT);
      it('responses wire', () => runResponsesMultiTurn(getApp(), model), TEST_TIMEOUT);
    });

    describe('truncation semantics', () => {
      it('chat wire: finish_reason=length', () => runChatTruncation(getApp(), model), TEST_TIMEOUT);
      it('messages wire: stop_reason=max_tokens', () => runMessagesTruncation(getApp(), model), TEST_TIMEOUT);
      it('responses wire: budget binds', () => runResponsesTruncation(getApp(), model), TEST_TIMEOUT);
    });

    describe('error envelopes (bogus model)', () => {
      it('chat wire: OpenAI error dialect', () => runChatErrorEnvelope(getApp(), entry.label), TEST_TIMEOUT);
      it('messages wire: Anthropic error dialect', () => runMessagesErrorEnvelope(getApp(), entry.label), TEST_TIMEOUT);
      it('responses wire: error object present', () => runResponsesErrorEnvelope(getApp(), entry.label), TEST_TIMEOUT);
    });

    describe('resilience', () => {
      it('mid-stream client abort does not wedge the app', () => runChatStreamAbort(getApp(), model, entry.label), TEST_TIMEOUT);
      it.skipIf(!hugePrompt)('oversized prompt returns a valid envelope', () => runChatHugePrompt(getApp(), model, hugePrompt), TEST_TIMEOUT);
    });
  });
}
