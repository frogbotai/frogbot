import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { storageContractSuite } from '../__helpers/shared/storage/storageContractSuite'
import { mediaSlug } from './shared.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

storageContractSuite('azure', dirname, mediaSlug)
