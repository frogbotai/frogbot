export type ExportCapturesArgs = {
  output?: string;
  user?: string;
  apiKey?: string;
  from?: string;
  to?: string;
  operation?: string;
};

export function parseExportCapturesArgs(args: string[]): ExportCapturesArgs {
  const parsed: ExportCapturesArgs = {};
  const names = new Set(['--output', '--user', '--api-key', '--from', '--to', '--operation']);
  for (let index = 0; index < args.length; index += 1) {
    const [flag, inlineValue] = args[index].split(/=(.*)/s);
    if (!names.has(flag)) throw new Error(`unknown option ${flag}`);
    const value = inlineValue ?? args[++index];
    if (value === undefined) throw new Error(`missing value for ${flag}`);
    if (flag === '--output') parsed.output = value;
    if (flag === '--user') parsed.user = value;
    if (flag === '--api-key') parsed.apiKey = value;
    if (flag === '--from') parsed.from = value;
    if (flag === '--to') parsed.to = value;
    if (flag === '--operation') parsed.operation = value;
  }
  for (const name of ['from', 'to'] as const) {
    if (parsed[name] && Number.isNaN(new Date(parsed[name]).getTime())) {
      throw new Error(`--${name} must be a valid date`);
    }
  }
  return parsed;
}
