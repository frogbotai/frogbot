import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const log = process.env.MCP_FIXTURE_LOG;
const hang = new Set((process.env.MCP_FIXTURE_HANG ?? '').split(',').filter(Boolean));

if (process.env.MCP_FIXTURE_IGNORE_TERM) process.on('SIGTERM', () => {});

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const tools = [
  {
    name: 'echo',
    description: 'Echo the text back',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  { name: 'shot', description: 'Take a screenshot', inputSchema: { type: 'object' } },
  { name: 'fail', inputSchema: { type: 'object' } },
  { name: 'slow', description: 'Wait for a minute', inputSchema: { type: 'object' } },
  { name: 'die', description: 'Exit the server', inputSchema: { type: 'object' } },
  { name: 'look.up', description: 'A name with a dot', inputSchema: { type: 'object' } },
];

function record(entry) {
  if (log) appendFileSync(log, `${JSON.stringify({ pid: process.pid, ...entry })}\n`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({ jsonrpc: '2.0', id, result: value });
}

function call(id, name, args) {
  switch (name) {
    case 'echo':
      return result(id, { content: [{ type: 'text', text: String(args?.text) }] });
    case 'shot':
      return result(id, {
        content: [
          { type: 'text', text: 'A screenshot' },
          { type: 'image', data: PNG, mimeType: 'image/png' },
        ],
      });
    case 'fail':
      return result(id, { content: [{ type: 'text', text: 'Something broke' }], isError: true });
    case 'slow':
      setTimeout(() => result(id, { content: [{ type: 'text', text: 'done' }] }), 60_000);

      return;
    case 'die':
      process.exit(0);

      return;
    default:
      return result(id, {
        content: [{ type: 'text', text: `Unknown tool ${name}` }],
        isError: true,
      });
  }
}

record({
  event: 'start',
  cwd: process.cwd(),
  env: { own: process.env.MCP_FIXTURE_ENV, host: process.env.MCP_FIXTURE_HOST },
});

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;

  const message = JSON.parse(line);

  record({ message });

  if (message.id === undefined || hang.has(message.method)) return;

  switch (message.method) {
    case 'initialize':
      return result(message.id, {
        protocolVersion: message.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'fixture', version: '1.0.0' },
      });
    case 'tools/list':
      return result(message.id, { tools });
    case 'tools/call':
      return call(message.id, message.params.name, message.params.arguments);
    case 'ping':
      return result(message.id, {});
    default:
      return send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` },
      });
  }
});

process.stdin.on('end', () => process.exit(0));
