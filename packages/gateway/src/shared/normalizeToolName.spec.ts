import { describe, expect, test } from 'vitest';
import { normalizeToolName } from './normalizeToolName.js';

describe('normalizeToolName', () => {
  test('passes through valid names unchanged', () => {
    expect(normalizeToolName('get_weather')).toBe('get_weather');
    expect(normalizeToolName('my-tool.v2')).toBe('my-tool.v2');
  });

  test('replaces invalid characters with underscore', () => {
    expect(normalizeToolName('bad. Tool- name1!@')).toBe('bad._Tool-_name1__');
  });

  test('truncates names longer than 128 chars', () => {
    const result = normalizeToolName('a'.repeat(200));
    expect(result).toHaveLength(128);
    expect(result).toBe('a'.repeat(128));
  });

  test('handles empty string', () => {
    expect(normalizeToolName('')).toBe('');
  });

  test('replaces spaces with underscore', () => {
    expect(normalizeToolName('my tool')).toBe('my_tool');
  });
});
