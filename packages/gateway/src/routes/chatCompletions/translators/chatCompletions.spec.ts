// Tests for the OpenAI chat-completions inbound parser (`toModelMessages`).
//
// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------
// Test cases adapted from opencode (Apache-2.0):
//   - packages/core/test/github-copilot/convert-to-copilot-messages.test.ts
// Original copyright © sst.dev. Licensed under Apache-2.0.
// Adapted for the gateway under MIT.
//
// **Inversion**: opencode's tests exercise the forward direction
// (`LanguageModelV3Prompt → OpenAI wire`). Our parser is the inverse
// (`OpenAI wire → AI SDK ModelMessage[]`). For each upstream case we swap
// input ↔ expected output. A handful of forward-only quirks (copilot
// `reasoning_opaque` providerOptions plumbing, image-detail forwarding) are
// dropped — those belong to outbound translation, not inbound parsing.
//
// Three OpenAI-wire-specific cases the upstream tests don't cover are added
// at the bottom (lenient data-URL parser, adjacent-tool-message coalesce,
// `developer` role mapping). These exercise the stage-4.5 parser additions.
// ---------------------------------------------------------------------------

import { describe, expect, test } from 'vitest';

import {
  type OpenAIMessage,
  toModelMessages,
} from './index.js';

// ---------------------------------------------------------------------------
// system messages
// ---------------------------------------------------------------------------

describe('system messages', () => {
  test('forwards system message content as a string', () => {
    const result = toModelMessages([
      {
        role: 'system',
        content: 'You are a helpful assistant with AGENTS.md instructions.',
      },
    ]);

    expect(result).toEqual([
      {
        role: 'system',
        content: 'You are a helpful assistant with AGENTS.md instructions.',
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// user messages
// ---------------------------------------------------------------------------

describe('user messages', () => {
  test('passes through string content unchanged', () => {
    const result = toModelMessages([{ role: 'user', content: 'Hello' }]);

    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  test('parses a single text content part', () => {
    const result = toModelMessages([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);

    expect(result).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);
  });

  test('parses base64 data-URL image_url into a file part', () => {
    // Inverse of opencode's "should convert messages with image parts".
    const result = toModelMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AAECAw==' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: 'AAECAw==' },
          },
        ],
      },
    ]);
  });

  test('rejects http(s) image_url with a clean 400 (data URLs only)', () => {
    // Decision (Stage 7.5): we previously emitted `mediaType: "image"` as a
    // sentinel for remote URLs, but that's not a valid MIME and downstream
    // providers may reject it silently. We support inline data URLs only;
    // remote URLs throw an `UnsupportedModalityError` with a precise param.
    expect(() =>
      toModelMessages([
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } },
          ],
        },
      ]),
    ).toThrow(/remote image URL/);
  });

  test('preserves multiple adjacent text parts without flattening', () => {
    const result = toModelMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
        ],
      },
    ]);
  });

  test('parses input_audio (wav) into an audio file part', () => {
    const result = toModelMessages([
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: { data: 'AAECAw==', format: 'wav' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'audio/wav',
            data: { type: 'data', data: 'AAECAw==' },
          },
        ],
      },
    ]);
  });

  test('parses inline file (file_data data URL)', () => {
    const result = toModelMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            file: {
              filename: 'doc.pdf',
              file_data: 'data:application/pdf;base64,JVBER==',
            },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'application/pdf',
            filename: 'doc.pdf',
            data: { type: 'data', data: 'JVBER==' },
          },
        ],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// assistant messages
// ---------------------------------------------------------------------------

describe('assistant messages', () => {
  test('text-only assistant collapses to a string content (fast path)', () => {
    // Inverse of opencode's "should convert assistant text messages". The
    // parser's fast path emits a string instead of `[{type:'text',...}]`.
    const result = toModelMessages([
      { role: 'assistant', content: 'Hello back!' },
    ]);

    expect(result).toEqual([{ role: 'assistant', content: 'Hello back!' }]);
  });

  test('tool-calls-only assistant emits a single tool-call part with parsed args', () => {
    // Inverse of opencode's "should handle assistant message with null
    // content when only tool calls". OpenAI ships arguments as a JSON string;
    // our parser inverts that with `JSON.parse`.
    const result = toModelMessages([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call1',
            type: 'function',
            function: {
              name: 'calculator',
              arguments: JSON.stringify({ a: 1, b: 2 }),
            },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call1',
            toolName: 'calculator',
            input: { a: 1, b: 2 },
          },
        ],
      },
    ]);
  });

  test('text + multiple tool calls produces text part followed by tool-call parts', () => {
    // Inverse of opencode's "text plus multiple tool calls". The upstream
    // forward direction concatenates adjacent text into a single
    // `content` string; OpenAI's wire shape only has one `content` string
    // per assistant message, so on the way back in we get a single text
    // part rather than the two text parts the forward test emitted.
    const result = toModelMessages([
      {
        role: 'assistant',
        content: 'Checking... Almost there...',
        tool_calls: [
          {
            id: 'call1',
            type: 'function',
            function: {
              name: 'searchTool',
              arguments: JSON.stringify({ query: 'Weather' }),
            },
          },
          {
            id: 'call2',
            type: 'function',
            function: {
              name: 'mapsTool',
              arguments: JSON.stringify({ location: 'Paris' }),
            },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking... Almost there...' },
          {
            type: 'tool-call',
            toolCallId: 'call1',
            toolName: 'searchTool',
            input: { query: 'Weather' },
          },
          {
            type: 'tool-call',
            toolCallId: 'call2',
            toolName: 'mapsTool',
            input: { location: 'Paris' },
          },
        ],
      },
    ]);
  });

  test('reasoning_content lifts into a reasoning part ordered before text', () => {
    // Adapted from opencode's reasoning tests. Their wire field
    // (`reasoning_text` + `reasoning_opaque`) is copilot-specific; OpenAI's
    // canonical wire field is `reasoning_content` (no opaque signature). We
    // test the canonical shape — opaque-signature plumbing belongs to
    // outbound translation, not inbound parsing.
    const result = toModelMessages([
      {
        role: 'assistant',
        content: 'The answer is 42.',
        reasoning_content: 'Let me think about this...',
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Let me think about this...' },
          { type: 'text', text: 'The answer is 42.' },
        ],
      },
    ]);
  });

  test('reasoning-only assistant emits a parts array with just the reasoning part', () => {
    const result = toModelMessages([
      {
        role: 'assistant',
        content: '',
        reasoning_content: 'Just thinking, no response yet',
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Just thinking, no response yet' },
        ],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// tool calls / results (coalesce)
// ---------------------------------------------------------------------------

describe('tool calls and results', () => {
  test('correlated tool-call + tool-result round-trip with toolName resolution', () => {
    // Inverse of opencode's "should stringify arguments to tool calls".
    // OpenAI's wire format omits `toolName` from the tool message — correlation
    // is `tool_call_id` only. The translator runs a pre-pass to build a
    // `tool_call_id → toolName` map from prior assistant turns and fills it
    // in during coalescing. opencode does the equivalent via its `toolNames`
    // set (`session/message-v2.ts:787-821`).
    const result = toModelMessages([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'quux',
            type: 'function',
            function: {
              name: 'thwomp',
              arguments: JSON.stringify({ foo: 'bar123' }),
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'quux',
        content: JSON.stringify({ oof: '321rab' }),
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'quux',
            toolName: 'thwomp',
            input: { foo: 'bar123' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'quux',
            toolName: 'thwomp',
            output: { type: 'text', value: JSON.stringify({ oof: '321rab' }) },
          },
        ],
      },
    ]);
  });

  test('tool message without a prior matching tool_call falls back to empty toolName', () => {
    // Malformed input — a tool message referencing an id that no prior
    // assistant turn produced. We tolerate it (empty toolName) rather than
    // reject, matching the spirit of opencode's lenient correlation pass.
    const result = toModelMessages([
      { role: 'tool', tool_call_id: 'orphan-id', content: 'oops' },
    ]);
    expect(result).toEqual([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'orphan-id',
            toolName: '',
            output: { type: 'text', value: 'oops' },
          },
        ],
      },
    ]);
  });

  test('text tool result passes through as text output', () => {
    const result = toModelMessages([
      {
        role: 'tool',
        tool_call_id: 'call-1',
        content: 'It is sunny today',
      },
    ]);

    expect(result).toEqual([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: '',
            output: { type: 'text', value: 'It is sunny today' },
          },
        ],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// full conversation
// ---------------------------------------------------------------------------

describe('full conversation', () => {
  test('multi-turn conversation with reasoning round-trips', () => {
    const result = toModelMessages([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is 2+2?' },
      {
        role: 'assistant',
        content: '2+2 equals 4.',
        reasoning_content: 'Let me calculate 2+2...',
      },
      { role: 'user', content: 'What about 3+3?' },
    ]);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
    expect(result[2]).toEqual({
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'Let me calculate 2+2...' },
        { type: 'text', text: '2+2 equals 4.' },
      ],
    });
  });
});

// ===========================================================================
// OpenAI-wire-specific cases not present in opencode's forward tests
// ===========================================================================
//
// Per the stage-7 development plan, these three cases exercise parser
// behavior that only matters on the inbound side and therefore has no
// forward-direction analogue in opencode's suite.

describe('lenient data URL parser (extra: stage 4.5)', () => {
  test('accepts data URL with extra parameters before the base64 marker', () => {
    // RFC 2397 allows arbitrary `;<param>=<value>` segments before the
    // optional `;base64` marker. Real clients occasionally append `charset`
    // or `name=` when pasting images from clipboards/email — the parser
    // must tolerate these without losing the media type.
    const result = toModelMessages([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;charset=utf-8;name=foo.png;base64,AAECAw==',
            },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: 'AAECAw==' },
          },
        ],
      },
    ]);
  });
});

describe('adjacent tool-message coalesce (extra: stage 4.5)', () => {
  test('three wire tool messages collapse into one AI SDK tool ModelMessage', () => {
    // OpenAI's wire format ships ONE message per tool result, each with its
    // own `tool_call_id`. AI SDK's convention is ONE `tool` ModelMessage
    // whose `content` is an array of `tool-result` parts. The parser
    // coalesces runs of adjacent tool messages — verifies the fan-in.
    const wire: OpenAIMessage[] = [
      { role: 'tool', tool_call_id: 'call1', content: 'Result 1' },
      { role: 'tool', tool_call_id: 'call2', content: 'Result 2' },
      { role: 'tool', tool_call_id: 'call3', content: 'Result 3' },
    ];

    const result = toModelMessages(wire);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call1',
          toolName: '',
          output: { type: 'text', value: 'Result 1' },
        },
        {
          type: 'tool-result',
          toolCallId: 'call2',
          toolName: '',
          output: { type: 'text', value: 'Result 2' },
        },
        {
          type: 'tool-result',
          toolCallId: 'call3',
          toolName: '',
          output: { type: 'text', value: 'Result 3' },
        },
      ],
    });
  });

  test('non-tool message between tool runs starts a new tool ModelMessage', () => {
    // Verifies that the coalesce is run-bounded — only ADJACENT tool wire
    // messages merge. An intervening assistant/user message must flush.
    const wire: OpenAIMessage[] = [
      { role: 'tool', tool_call_id: 'a', content: 'A' },
      { role: 'assistant', content: 'thinking...' },
      { role: 'tool', tool_call_id: 'b', content: 'B' },
    ];

    const result = toModelMessages(wire);

    expect(result).toHaveLength(3);
    expect(result[0]?.role).toBe('tool');
    expect(result[1]?.role).toBe('assistant');
    expect(result[2]?.role).toBe('tool');
  });
});

describe('developer role mapping (extra: stage 4.5)', () => {
  test('OpenAI o1-series `developer` role maps to AI SDK `system`', () => {
    // OpenAI's o1-series renamed `system` to `developer`. Both flow into the
    // AI SDK's `system` role so downstream providers see a uniform shape.
    const result = toModelMessages([
      { role: 'developer', content: 'You are a careful reasoner.' },
    ]);

    expect(result).toEqual([
      { role: 'system', content: 'You are a careful reasoner.' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Stage 7.5 additions: hardening
// ---------------------------------------------------------------------------

describe('audio format coverage', () => {
  test.each([
    ['wav', 'audio/wav'],
    ['mp3', 'audio/mpeg'],
    ['flac', 'audio/flac'],
    ['opus', 'audio/opus'],
    ['pcm16', 'audio/l16'],
  ])('input_audio format %s → mediaType %s', (format, expectedMime) => {
    const result = toModelMessages([
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: { data: 'AAAA', format },
          },
        ],
      },
    ]);
    expect(result).toEqual([
      {
        role: 'user',
        content: [{ type: 'file', mediaType: expectedMime, data: { type: 'data', data: 'AAAA' } }],
      },
    ]);
  });

  test('unknown audio format throws UnsupportedModalityError with precise param', () => {
    expect(() =>
      toModelMessages([
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              // @ts-expect-error — intentionally bad format for the test
              input_audio: { data: 'AAAA', format: 'aiff' },
            },
          ],
        },
      ]),
    ).toThrow(/audio format "aiff"/);
  });
});

describe('tool-call argument parsing', () => {
  test('valid JSON arguments parse to object input', () => {
    const result = toModelMessages([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'add', arguments: '{"a":1,"b":2}' },
          },
        ],
      },
    ]);
    expect(result[0]).toEqual({
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'add', input: { a: 1, b: 2 } }],
    });
  });

  test('empty arguments string yields {}', () => {
    const result = toModelMessages([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'noop', arguments: '' },
          },
        ],
      },
    ]);
    const content = (result[0] as { content: Array<{ input: unknown }> }).content;
    expect(content[0]?.input).toEqual({});
  });

  test('malformed JSON arguments throw InvalidToolArgumentsError with param path', () => {
    let caught: unknown;
    try {
      toModelMessages([
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'broken', arguments: '{not valid json' },
            },
          ],
        },
      ]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    const err = caught as { code?: string; param?: string; message?: string };
    expect(err.code).toBe('invalid_tool_arguments');
    expect(err.param).toBe('messages[0].tool_calls[0].function.arguments');
    expect(err.message).toMatch(/Invalid JSON/);
  });
});

describe('file part handling', () => {
  test('inline file_data data URL → FilePart with parsed mediaType', () => {
    const result = toModelMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            file: {
              filename: 'report.pdf',
              file_data: 'data:application/pdf;base64,JVBERi0xLjQK',
            },
          },
        ],
      },
    ]);
    expect(result[0]).toEqual({
      role: 'user',
      content: [
        {
          type: 'file',
          mediaType: 'application/pdf',
          filename: 'report.pdf',
          data: { type: 'data', data: 'JVBERi0xLjQK' },
        },
      ],
    });
  });

  test('file_id reference throws with `file_id`-pointed param', () => {
    let caught: unknown;
    try {
      toModelMessages([
        {
          role: 'user',
          content: [{ type: 'file', file: { file_id: 'file-abc123' } }],
        },
      ]);
    } catch (e) {
      caught = e;
    }
    const err = caught as { code?: string; param?: string };
    expect(err.code).toBe('unsupported_modality');
    expect(err.param).toBe('messages[0].content[0].file.file_id');
  });

  test('non-data-URL file_data throws with `file_data`-pointed param', () => {
    let caught: unknown;
    try {
      toModelMessages([
        {
          role: 'user',
          content: [
            { type: 'file', file: { file_data: 'https://example.com/file.pdf' } },
          ],
        },
      ]);
    } catch (e) {
      caught = e;
    }
    const err = caught as { code?: string; param?: string };
    expect(err.code).toBe('unsupported_modality');
    expect(err.param).toBe('messages[0].content[0].file.file_data');
  });
});
describe('skipped fields (M1+) — tracked gaps', () => {
  // These describe placeholders pin the milestones for fields we type but
  // intentionally drop. When the milestone lands, replace `test.todo` with a
  // real test asserting the field round-trips.

  test.todo('M1: body.tools forwarded to generateText');
  test.todo('M1: body.tool_choice forwarded to generateText');
  test.todo('M1: body.parallel_tool_calls forwarded to generateText');
});

// ---------------------------------------------------------------------------
// G55 (OC12) — re-ingested fields must not be silently dropped.
// `refusal` → text part, `image_url.detail` → unknown.image_detail (remapped
// to `<provider>.imageDetail` by forwardLanguageParams), `extra_content` →
// message providerOptions. `name` has no ModelMessage mapping and is
// intentionally dropped (parity with the AI SDK's converters).
// ---------------------------------------------------------------------------

describe('re-ingested field forwarding (G55)', () => {
  test('assistant `refusal` surfaces in translated content as a text part', () => {
    const result = toModelMessages([
      { role: 'assistant', content: null, refusal: 'I cannot do that.' },
    ]);

    expect(result).toEqual([
      { role: 'assistant', content: [{ type: 'text', text: 'I cannot do that.' }] },
    ]);
  });

  test('assistant `refusal` is appended after existing text content', () => {
    const result = toModelMessages([
      { role: 'assistant', content: 'Partial answer.', refusal: 'Then I refused.' },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Partial answer.' },
          { type: 'text', text: 'Then I refused.' },
        ],
      },
    ]);
  });

  test('assistant `refusal: null` keeps the plain-text fast path', () => {
    const result = toModelMessages([
      { role: 'assistant', content: 'hello', refusal: null },
    ]);

    expect(result).toEqual([{ role: 'assistant', content: 'hello' }]);
  });

  test('image_url.detail is forwarded as unknown.image_detail providerOptions', () => {
    const result = toModelMessages([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AAECAw==', detail: 'low' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: 'AAECAw==' },
            providerOptions: { unknown: { image_detail: 'low' } },
          },
        ],
      },
    ]);
  });

  test('image_url.detail merges with part-level cache_control providerOptions', () => {
    const result = toModelMessages([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AAECAw==', detail: 'high' },
            cache_control: { type: 'ephemeral' },
          },
        ],
      },
    ]);

    expect(result[0].content).toEqual([
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'data', data: 'AAECAw==' },
        providerOptions: {
          unknown: { cache_control: { type: 'ephemeral' }, image_detail: 'high' },
        },
      },
    ]);
  });

  test('assistant extra_content is forwarded as message providerOptions', () => {
    const result = toModelMessages([
      {
        role: 'assistant',
        content: 'prior turn',
        extra_content: { openai: { fingerprint: 'fp_123' } },
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'prior turn',
        providerOptions: { openai: { fingerprint: 'fp_123' } },
      },
    ]);
  });

  test('assistant extra_content merges with cache_control without clobbering', () => {
    const result = toModelMessages([
      {
        role: 'assistant',
        content: 'prior turn',
        cache_control: { type: 'ephemeral' },
        extra_content: { anthropic: { signature: 'sig_1' } },
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'prior turn',
        providerOptions: {
          anthropic: { signature: 'sig_1' },
          unknown: { cache_control: { type: 'ephemeral' } },
        },
      },
    ]);
  });

  test('`name` is accepted and intentionally dropped (no ModelMessage mapping)', () => {
    const result = toModelMessages([
      { role: 'system', content: 'sys', name: 'orchestrator' },
      { role: 'user', content: 'hi', name: 'alice' },
      { role: 'assistant', content: 'hello', name: 'agent-1' },
    ]);

    expect(result).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// G8 (OC3) — array-of-text-parts content on system, tool, and assistant
// messages must be accepted and joined to a string.
// ---------------------------------------------------------------------------

describe('array-of-text-parts content (G8)', () => {
  test('system message content as array is joined to a string', () => {
    const result = toModelMessages([
      {
        role: 'system',
        content: [{ type: 'text', text: 'part-a ' }, { type: 'text', text: 'part-b' }],
      },
    ]);

    expect(result).toEqual([{ role: 'system', content: 'part-a part-b' }]);
  });

  test('tool message content as array is mapped to content-typed output', () => {
    const result = toModelMessages([
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content: [{ type: 'text', text: 'result: 18C' }],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: '',
            output: { type: 'content', value: [{ type: 'text', text: 'result: 18C' }] },
          },
        ],
      },
    ]);
  });

  test('assistant message content as array is joined to a string', () => {
    const result = toModelMessages([
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'prior ' }, { type: 'text', text: 'turn' }],
      },
    ]);

    expect(result).toEqual([{ role: 'assistant', content: 'prior turn' }]);
  });
});

// ---------------------------------------------------------------------------
// Compatibility tolerance — unknown roles + extra fields (AI SDK philosophy)
// ---------------------------------------------------------------------------
// Mirrors the AI SDK's "limited schema" approach: unknown fields pass through,
// unknown roles are forwarded rather than rejected.

describe('compatibility tolerance', () => {
  test('unknown role is forwarded as system message with [role=X] prefix', () => {
    const result = toModelMessages([
      { role: 'function', content: '{"result":42}' } as OpenAIMessage,
    ]);
    expect(result).toEqual([
      { role: 'system', content: '[role=function] {"result":42}' },
    ]);
  });

  test('vendor-specific role with non-string content is JSON-serialised', () => {
    const result = toModelMessages([
      { role: 'thought', content: null } as unknown as OpenAIMessage,
    ]);
    expect(result[0]).toEqual({
      role: 'system',
      content: '[role=thought] ""',
    });
  });

  test('extra fields on user message are stripped without error', () => {
    const result = toModelMessages([
      {
        role: 'user',
        content: 'hi',
        thinking: 'internal reasoning',
        vendor_field: 123,
      } as OpenAIMessage,
    ]);
    expect(result).toEqual([{ role: 'user', content: 'hi' }]);
  });

  test('extra fields on assistant message are stripped without error', () => {
    const result = toModelMessages([
      {
        role: 'assistant',
        content: 'hello',
        reasoning_signature: 'abc123',
        provider_metadata: { model_version: '2.0' },
      } as OpenAIMessage,
    ]);
    expect(result).toEqual([{ role: 'assistant', content: 'hello' }]);
  });

  test('unknown content-part type throws UnsupportedModalityError with precise param', () => {
    let caught: unknown;
    try {
      toModelMessages([
        {
          role: 'user',
          content: [{ type: 'video_url', video_url: { url: 'https://x' } }] as any,
        },
      ]);
    } catch (e) {
      caught = e;
    }
    const err = caught as { code?: string; param?: string; message?: string };
    expect(err.code).toBe('unsupported_modality');
    expect(err.param).toBe('messages[0].content[0].type');
    expect(err.message).toMatch(/video_url/);
  });

  test('unknown audio format throws UnsupportedModalityError from translator not schema', () => {
    // Previously this was caught by z.enum at schema level with a generic error.
    // Now the schema passes `format: z.string()` and the translator throws with
    // the precise param path.
    let caught: unknown;
    try {
      toModelMessages([
        {
          role: 'user',
          content: [
            { type: 'input_audio', input_audio: { data: 'AAAA', format: 'aac' } } as any,
          ],
        },
      ]);
    } catch (e) {
      caught = e;
    }
    const err = caught as { code?: string; param?: string; message?: string };
    expect(err.code).toBe('unsupported_modality');
    expect(err.param).toBe('messages[0].content[0].input_audio.format');
    expect(err.message).toMatch(/aac/);
  });
});
