import { createConnection } from 'node:net'

import {
  dbAdapters,
  generateDatabaseAdapter,
  getCurrentDatabaseAdapter,
} from './__helpers/shared/db/dbAdapters.js'
import type { DatabaseAdapterType } from './__helpers/shared/db/dbAdapters.js'

process.env.PAYLOAD_DISABLE_ADMIN = 'true'
process.env.PAYLOAD_DROP_DATABASE = 'true'

if (!process.env.FROGBOT_DATABASE) {
  process.env.FROGBOT_DATABASE = 'mongodb'
}

const adapter = getCurrentDatabaseAdapter()

await assertDbReachable(adapter)
generateDatabaseAdapter(adapter)

/**
 * TCP-ping the adapter's host:port. Skips file-based adapters (sqlite).
 * For mongodb, skips because we use in-memory (no Docker needed).
 */
async function assertDbReachable(adapterName: DatabaseAdapterType): Promise<void> {
  const entry = dbAdapters[adapterName]
  if (!('port' in entry) || !entry.port || !entry.host) {
    return
  }

  const host = entry.host
  const port = entry.port
  const timeoutMs = process.env.CI === 'true' ? 10000 : 2000

  const result = await tcpPing(host, port, timeoutMs)
  if (result === true) {
    return
  }

  const lines = [
    '',
    '\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m',
    `\x1b[31m✗ ${entry.label} is not reachable at ${host}:${port}\x1b[0m`,
    '',
    `  Adapter : \x1b[1m${adapterName}\x1b[0m`,
    `  Reason  : ${result}`,
    '',
    `  \x1b[2mStart the service:\x1b[0m`,
    `    \x1b[36mdocker compose -f test/docker-compose.yml --profile ${entry.profile} up -d\x1b[0m`,
    '',
    `  \x1b[2mOr use mongodb (no Docker needed):\x1b[0m`,
    `    \x1b[36mFROGBOT_DATABASE=mongodb pnpm test:int\x1b[0m`,
    '\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m',
    '',
  ]
  process.stderr.write(lines.join('\n'))
  process.exit(1)
}

function tcpPing(host: string, port: number, timeoutMs: number): Promise<string | true> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port })
    const done = (value: string | true) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    const timer = setTimeout(() => done(`timed out after ${timeoutMs}ms`), timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      done(true)
    })
    socket.once('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      done(err.code || err.message || String(err))
    })
  })
}
