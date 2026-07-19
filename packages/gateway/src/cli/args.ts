export type CliArgs = {
  configPath?: string;
  help: boolean;
  port?: number;
  quiet: boolean;
};

export function parseCliArgs(argv: string[]): CliArgs {
  const out: CliArgs = { help: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else if (arg === '--quiet' || arg === '-q') {
      out.quiet = true;
    } else if (arg === '--config' || arg === '-c') {
      out.configPath = requiredValue(arg, argv[++i]);
    } else if (arg?.startsWith('--config=')) {
      out.configPath = equalsValue('--config', arg.slice('--config='.length));
    } else if (arg === '--port' || arg === '-p') {
      out.port = parsePort(requiredValue(arg, argv[++i]), arg);
    } else if (arg?.startsWith('--port=')) {
      out.port = parsePort(equalsValue('--port', arg.slice('--port='.length)), '--port');
    } else {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  return out;
}

export function parsePort(raw: string | undefined, name = 'PORT'): number | undefined {
  if (!raw) return undefined;
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid ${name}: ${raw}`);
  }
  return port;
}

export function helpText(): string {
  return [
    'Usage: frogbotai-gateway [options]',
    '',
    'Options:',
    '  -p, --port <port>      Port to listen on (default: 3939 or PORT)',
    '  -c, --config <path>    Load config at the explicit config layer',
    '  -q, --quiet            Suppress startup banner',
    '  -h, --help             Show this help',
  ].join('\n');
}

function requiredValue(name: string, value: string | undefined): string {
  if (!value || value.startsWith('-')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function equalsValue(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
