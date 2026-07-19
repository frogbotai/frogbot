import { describe, expect, it } from 'vitest';

import { helpText, parseCliArgs, parsePort } from './args.js';

describe('parseCliArgs', () => {
  it('parses help, quiet, config, and port flags', () => {
    expect(parseCliArgs(['--help', '--quiet', '--config', 'gateway.config.ts', '--port', '4000'])).toEqual({
      configPath: 'gateway.config.ts',
      help: true,
      port: 4000,
      quiet: true,
    });
  });

  it('parses equals forms and aliases', () => {
    expect(parseCliArgs(['-q', '-c', 'gateway.json', '--port=4001'])).toEqual({
      configPath: 'gateway.json',
      help: false,
      port: 4001,
      quiet: true,
    });
  });

  it('rejects invalid ports', () => {
    expect(() => parsePort('70000')).toThrow('invalid PORT: 70000');
    expect(() => parseCliArgs(['--port', 'abc'])).toThrow('invalid --port: abc');
    expect(() => parsePort('0x50')).toThrow('invalid PORT: 0x50');
    expect(() => parsePort('8e1')).toThrow('invalid PORT: 8e1');
  });

  it('parses equals-form port values', () => {
    expect(parseCliArgs(['--port=8080']).port).toBe(8080);
  });

  it('rejects empty equals-form values', () => {
    expect(() => parseCliArgs(['--port='])).toThrow('--port requires a value');
    expect(() => parseCliArgs(['--config='])).toThrow('--config requires a value');
  });

  it('prints clean help text', () => {
    expect(helpText()).toContain('Usage: frogbotai-gateway [options]');
    expect(helpText()).toContain('--quiet');
  });
});
