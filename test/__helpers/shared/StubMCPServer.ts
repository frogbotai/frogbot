import { createServer } from 'node:http'

type StubMCPServerOptions = {
  requireBearer?: string
}

export async function startStubMCPServer(options: StubMCPServerOptions = {}) {
  const receivedAuth: Array<string | undefined> = []
  const server = createServer(async (req, res) => {
    receivedAuth.push(req.headers.authorization)

    if (req.method === 'GET') {
      res.writeHead(405).end()
      return
    }

    if (req.method !== 'POST') {
      res.writeHead(405).end()
      return
    }

    if (options.requireBearer && req.headers.authorization !== `Bearer ${options.requireBearer}`) {
      res.writeHead(401).end()
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const message = JSON.parse(Buffer.concat(chunks).toString()) as {
      id?: number
      method: string
      params?: { arguments?: unknown; name?: string }
    }

    if (message.method === 'notifications/initialized') {
      res.writeHead(202).end()
      return
    }

    let result: unknown
    if (message.method === 'initialize') {
      result = {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'frogbot-test', version: '1.0.0' },
      }
    } else if (message.method === 'tools/list') {
      result = {
        tools: [
          {
            name: 'echo_secret',
            description: 'Echo the supplied value',
            inputSchema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
            },
          },
          {
            name: 'without_description',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      }
    } else if (message.method === 'tools/call') {
      result = {
        content: [{ type: 'text', text: `stub:${JSON.stringify(message.params?.arguments)}` }],
        isError: false,
      }
    } else {
      res.writeHead(404).end()
      return
    }

    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Stub MCP server did not bind')

  return {
    url: `http://127.0.0.1:${address.port}`,
    receivedAuth,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}
