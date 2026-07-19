import { createConnection } from 'node:net'

export type StorageService = {
  name: string
  host: string
  port: number
}

export const storageServices: Record<string, StorageService> = {
  s3: { name: 'LocalStack (S3)', host: 'localhost', port: 4566 },
  r2: { name: 'LocalStack (R2)', host: 'localhost', port: 4566 },
  gcs: { name: 'fake-gcs-server', host: 'localhost', port: 4443 },
  azure: { name: 'Azurite', host: '127.0.0.1', port: 10000 },
  'vercel-blob': { name: 'Vercel Blob emulator', host: 'localhost', port: 3100 },
  local: { name: 'local (no Docker)', host: '', port: 0 },
}

export async function isServiceReachable(service: StorageService): Promise<boolean> {
  if (!service.port) return true
  return new Promise((resolve) => {
    const socket = createConnection({ host: service.host, port: service.port })
    const timer = setTimeout(() => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(false)
    }, 1000)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve(false)
    })
  })
}
