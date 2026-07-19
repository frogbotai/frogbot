import { describe, expect, it } from 'vitest';

import { UnsupportedModalityError } from '../../../errors/gatewayError.js';
import { toResponsesToolChoice, toResponsesTools } from './tools.js';

describe('toResponsesTools', () => {
  it('maps flat Responses function tools to an AI SDK tool set', () => {
    const tools = toResponsesTools([
      { type: 'function', name: 'get_weather', description: 'Weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } },
    ], 'openai');

    expect(tools).toBeDefined();
    expect(Object.keys(tools!)).toEqual(['get_weather']);
    expect(tools!.get_weather.description).toBe('Weather');
  });

  it('returns undefined for empty or nullish tool lists', () => {
    expect(toResponsesTools([], 'openai')).toBeUndefined();
    expect(toResponsesTools(null, 'openai')).toBeUndefined();
    expect(toResponsesTools(undefined, 'openai')).toBeUndefined();
  });

  it('forwards a hosted web_search tool as a provider-defined tool (openai)', () => {
    const tools = toResponsesTools([{ type: 'web_search' }], 'openai');

    expect(tools).toBeDefined();
    expect(tools!.web_search).toEqual({ type: 'provider', id: 'openai.web_search', args: {} });
  });

  it('forwards an mcp tool with its server config captured as args (openai)', () => {
    const tools = toResponsesTools([
      { type: 'mcp', server_label: 'deepwiki', server_url: 'https://mcp.deepwiki.com/mcp', require_approval: 'never' },
    ], 'openai');

    expect(tools!.mcp).toEqual({
      type: 'provider',
      id: 'openai.mcp',
      args: { server_label: 'deepwiki', server_url: 'https://mcp.deepwiki.com/mcp', require_approval: 'never' },
    });
  });

  it('keeps hosted tools alongside function tools (openai)', () => {
    const tools = toResponsesTools([
      { type: 'web_search' },
      { type: 'function', name: 'get_weather', parameters: { type: 'object', properties: {} } },
    ], 'openai');

    expect(Object.keys(tools!).sort()).toEqual(['get_weather', 'web_search']);
    expect(tools!.web_search).toEqual({ type: 'provider', id: 'openai.web_search', args: {} });
  });

  it('rejects hosted tools on a non-OpenAI provider with UnsupportedModalityError', () => {
    expect(() => toResponsesTools([{ type: 'web_search' }], 'anthropic')).toThrow(UnsupportedModalityError);
  });
});

describe('toResponsesToolChoice', () => {
  it('passes through string strategies', () => {
    expect(toResponsesToolChoice('auto')).toBe('auto');
    expect(toResponsesToolChoice('none')).toBe('none');
    expect(toResponsesToolChoice('required')).toBe('required');
  });

  it('maps a flat named function choice', () => {
    expect(toResponsesToolChoice({ type: 'function', name: 'get_weather' })).toEqual({ type: 'tool', toolName: 'get_weather' });
  });

  it('maps a hosted tool_choice to a named tool choice', () => {
    expect(toResponsesToolChoice({ type: 'web_search' })).toEqual({ type: 'tool', toolName: 'web_search' });
    expect(toResponsesToolChoice({ type: 'file_search' })).toEqual({ type: 'tool', toolName: 'file_search' });
    expect(toResponsesToolChoice({ type: 'mcp' })).toEqual({ type: 'tool', toolName: 'mcp' });
  });

  it('tolerates the nested chat shape', () => {
    expect(toResponsesToolChoice({ type: 'function', function: { name: 'get_weather' } })).toEqual({ type: 'tool', toolName: 'get_weather' });
  });

  it('returns undefined for nullish or unknown choices', () => {
    expect(toResponsesToolChoice(null)).toBeUndefined();
    expect(toResponsesToolChoice({ type: 'mystery' })).toBeUndefined();
  });
});
