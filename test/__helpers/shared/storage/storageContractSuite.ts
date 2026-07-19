import path from 'node:path'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'

import type { BootedFrogbot } from '../bootFrogbot'
import { bootFrogbot } from '../bootFrogbot'
import { clearAndSeed } from '../clearAndSeed'
import { isServiceReachable, storageServices } from './storageServices'

const uploadsDir = path.resolve(import.meta.dirname, '../../../uploads')
const testImagePath = path.resolve(uploadsDir, 'image.png')

export interface StorageContractOptions {
  beforeSetup?: () => Promise<void>
}

export function storageContractSuite(adapterName: string, dirname: string, mediaSlug: string, options?: StorageContractOptions) {
  describe(`storage contract [${adapterName}]`, () => {
    let booted: BootedFrogbot
    let skipSuite = false

    beforeAll(async () => {
      const service = storageServices[adapterName]
      if (service && service.port > 0) {
        const reachable = await isServiceReachable(service)
        if (!reachable) {
          skipSuite = true
          console.warn(
            `\x1b[33m⚠ Skipping ${adapterName} storage tests — ` +
            `${service.name} not reachable at ${service.host}:${service.port}. ` +
            `Start with: docker compose -f test/docker-compose.yml --profile storage up -d\x1b[0m`,
          )
          return
        }
      }
      if (options?.beforeSetup) await options.beforeSetup()
      booted = await bootFrogbot(dirname)
    })

    afterAll(async () => {
      if (booted) await booted.shutdown()
    })

    beforeEach(async (ctx) => {
      if (skipSuite) {
        ctx.skip()
        return
      }
      await clearAndSeed(booted.frogbot, 'empty')
    })

    describe('upload', () => {
      it('creates an upload record via local API with filePath', async () => {
        const doc = await booted.frogbot.create({
          collection: mediaSlug,
          data: { alt: 'test image' },
          filePath: testImagePath,
          overrideAccess: true,
        })
        expect(doc.id).toBeDefined()
        expect(doc.filename).toBeDefined()
        expect(doc.mimeType).toBe('image/png')
      })

      it('findByID returns the upload metadata', async () => {
        const created = await booted.frogbot.create({
          collection: mediaSlug,
          data: {},
          filePath: testImagePath,
          overrideAccess: true,
        })
        const found = await booted.frogbot.findByID({
          collection: mediaSlug,
          id: created.id,
          overrideAccess: true,
        })
        expect(found.filename).toBe(created.filename)
        expect(found.mimeType).toBe('image/png')
        expect(found.filesize).toBeGreaterThan(0)
      })
    })

    describe('read', () => {
      it('the uploaded file is accessible via static URL', async () => {
        const doc = await booted.frogbot.create({
          collection: mediaSlug,
          data: {},
          filePath: testImagePath,
          overrideAccess: true,
        })
        const url = doc.url as string
        expect(url).toBeDefined()

        const res = await fetch(`${booted.baseUrl}${url}`)
        expect([200, 204]).toContain(res.status)
        const ct = res.headers.get('content-type') ?? ''
        expect(ct === 'image/png' || ct === 'application/octet-stream').toBe(true)
      })
    })

    describe('delete', () => {
      it('deleting the upload removes the DB record', async () => {
        const doc = await booted.frogbot.create({
          collection: mediaSlug,
          data: {},
          filePath: testImagePath,
          overrideAccess: true,
        })
        await booted.frogbot.delete({
          collection: mediaSlug,
          id: doc.id,
          overrideAccess: true,
        })

        await expect(
          booted.frogbot.findByID({
            collection: mediaSlug,
            id: doc.id,
            overrideAccess: true,
          }),
        ).rejects.toThrow()
      })

      it('the file URL is no longer accessible after deletion', async () => {
        const doc = await booted.frogbot.create({
          collection: mediaSlug,
          data: {},
          filePath: testImagePath,
          overrideAccess: true,
        })
        const url = doc.url as string
        await booted.frogbot.delete({
          collection: mediaSlug,
          id: doc.id,
          overrideAccess: true,
        })

        const res = await fetch(`${booted.baseUrl}${url}`)
        expect([404, 500]).toContain(res.status)
      })
    })

    describe('multiple uploads', () => {
      it('handles multiple files without collision', async () => {
        const doc1 = await booted.frogbot.create({
          collection: mediaSlug,
          data: { alt: 'first' },
          filePath: testImagePath,
          overrideAccess: true,
        })
        const doc2 = await booted.frogbot.create({
          collection: mediaSlug,
          data: { alt: 'second' },
          filePath: testImagePath,
          overrideAccess: true,
        })

        expect(doc1.id).not.toBe(doc2.id)

        const found1 = await booted.frogbot.findByID({ collection: mediaSlug, id: doc1.id, overrideAccess: true })
        const found2 = await booted.frogbot.findByID({ collection: mediaSlug, id: doc2.id, overrideAccess: true })
        expect(found1.alt).toBe('first')
        expect(found2.alt).toBe('second')
      })
    })
  })
}
