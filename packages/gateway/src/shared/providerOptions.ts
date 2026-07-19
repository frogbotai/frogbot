import type { JSONValue } from 'ai';

const providerOptionKeys: Record<string, string> = {
  'black-forest-labs': 'blackForestLabs',
};

export function createProviderOptions(args: {
  providerName: string;
  options: Record<string, JSONValue>;
}): Record<string, Record<string, JSONValue>> {
  if (Object.keys(args.options).length === 0) return {};
  return { [providerOptionKeys[args.providerName] ?? args.providerName]: args.options };
}
