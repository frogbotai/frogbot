import path from 'path'
import { pathToFileURL } from 'url'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { Frogbot } from 'frogbot/test'
import type { FrogbotSanitizedConfig } from 'frogbot/test'
import type { MongooseAdapter } from '@frogbotai/db-mongodb'
import { createGatewayHandler } from 'frogbot'
import type { FrogbotInstance } from 'frogbot'
import type { Payload } from 'payload'

import { FrogbotRESTClient } from './FrogbotRESTClient'

export type BootedFrogbot = {
  frogbot: FrogbotInstance
  payload: Payload
  restClient: FrogbotRESTClient
  baseUrl: string
  shutdown: () => Promise<void>
}

/**
 * Boot a real frogbot HTTP server configured by `config.ts` in the
 * given test suite directory.
 *
 * The database adapter is determined by the FROGBOT_DATABASE env var
 * and loaded from the generated `test/databaseAdapter.js` file. The
 * corresponding Docker service must already be running.
 *
 * Each test file gets its own database to prevent cross-contamination
 * when vitest runs files in parallel. Pass `suiteNameOverride` when
 * multiple spec files share a config directory.
 *
 * Returns the FrogBot-vocab `FrogbotInstance` — the same surface
 * users see on `req.frogbot`. Payload is not exposed; tests speak
 * frogbot, not Payload.
 *
 * Callers MUST invoke `shutdown` in an `afterAll` hook.
 */
export async function bootFrogbot(dirname: string, suiteNameOverride?: string): Promise<BootedFrogbot> {
  const suiteName = suiteNameOverride ?? path.basename(dirname)
  const dbType = process.env.FROGBOT_DATABASE || 'mongodb'

  if (dbType === 'mongodb') {
    const baseUri = process.env.MONGODB_URI || 'mongodb://localhost:27018?directConnection=true&replicaSet=rs0'
    const parsed = new URL(baseUri)
    parsed.pathname = `/frogbot-test-${suiteName}`
    process.env.MONGODB_URI = parsed.toString()
  }

  const configPath = path.resolve(dirname, 'config.ts')
  const mod = (await import(pathToFileURL(configPath).href)) as {
    default: FrogbotSanitizedConfig | Promise<FrogbotSanitizedConfig>
  }
  const config = await mod.default

  const frogbot: FrogbotInstance = await new Frogbot().init({ config })
  const payload = (frogbot as unknown as { payload: Payload }).payload
  if (payload.db.name === 'mongoose') {
    const db = payload.db as MongooseAdapter
    await Promise.all(Object.values(db.connection.models).map((model) => model.init()))
  }
  const app = createTestServer(frogbot)
  const port = await getEphemeralPort()
  const closeServer = await listen(app, port)
  const baseUrl = `http://127.0.0.1:${port}`
  const restClient = new FrogbotRESTClient(baseUrl)

  const shutdown = async () => {
    await closeServer()
    await frogbot.destroy()
  }

  return { frogbot, payload, restClient, baseUrl, shutdown }
}

function createTestServer(frogbot: FrogbotInstance): Hono {
  const app = new Hono()
  app.get('/', (c) => c.json({ ok: true, name: 'frogbot' }))
  if (frogbot.config.ai) {
    const gatewayHandler = createGatewayHandler(frogbot)
    app.all('/api/ai/*', (c) => gatewayHandler(c.req.raw))
  }
  app.all('/api/*', (c) => frogbot.handleRequest(c.req.raw.clone()))
  return app
}

function listen(app: Hono, port: number): Promise<() => Promise<void>> {
  const server = serve({ fetch: app.fetch, port })
  return Promise.resolve(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      }),
  )
}

async function getEphemeralPort(): Promise<number> {
  const net = await import('net')
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, () => {
      const address = server.address()
      if (typeof address === 'object' && address) {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        reject(new Error('[test] could not resolve ephemeral port'))
      }
    })
  })
}
