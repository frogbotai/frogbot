import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const BUMPS = ['major', 'minor', 'patch']
const bump = process.argv[2]
if (!BUMPS.includes(bump)) {
  console.error(`Usage: pnpm bump <${BUMPS.join('|')}>`)
  process.exit(1)
}

function inc(version, type) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Cannot parse version "${version}" — expected x.y.z`)
  let [major, minor, patch] = match.slice(1).map(Number)
  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function readJSON(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function writeJSON(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

const rootPath = path.join(ROOT, 'package.json')
const root = readJSON(rootPath)
const current = root.version
if (!current) throw new Error('Root package.json has no "version" field')

const next = inc(current, bump)

const targets = [{ path: rootPath, json: root, name: root.name }]
const packagesDir = path.join(ROOT, 'packages')
for (const dir of readdirSync(packagesDir)) {
  const pkgPath = path.join(packagesDir, dir, 'package.json')
  let json
  try {
    json = readJSON(pkgPath)
  } catch {
    continue
  }
  if (json.private) continue
  targets.push({ path: pkgPath, json, name: json.name })
}

console.log(`\nBumping ${current} -> ${next} (${bump})\n`)
for (const { path: file, json, name } of targets) {
  console.log(`  ${name.padEnd(36)} ${json.version} -> ${next}`)
  json.version = next
  writeJSON(file, json)
}
console.log(`\nDone. ${targets.length} package.json files updated.\n`)
console.log('Next: pnpm release')
