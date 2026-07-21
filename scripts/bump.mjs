import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
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

const packagesDir = path.join(ROOT, 'packages')
const packageDirs = readdirSync(packagesDir).map((dir) => path.join(packagesDir, dir))

const workspaceNames = new Set()
for (const dir of packageDirs) {
  const pkgPath = path.join(dir, 'package.json')
  if (!existsSync(pkgPath)) continue
  workspaceNames.add(readJSON(pkgPath).name)
}

const consumerDirs = []
for (const group of ['examples', 'templates']) {
  const groupDir = path.join(ROOT, group)
  if (!existsSync(groupDir)) continue
  for (const dir of readdirSync(groupDir)) {
    consumerDirs.push(path.join(groupDir, dir))
  }
}

const targets = [{ path: rootPath, json: root, name: root.name }]
for (const dir of [...packageDirs, ...consumerDirs]) {
  const pkgPath = path.join(dir, 'package.json')
  if (!existsSync(pkgPath)) continue
  const json = readJSON(pkgPath)
  targets.push({ path: pkgPath, json, name: json.name })
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

function pinWorkspaceDeps(json) {
  const changed = []
  for (const field of DEP_FIELDS) {
    const deps = json[field]
    if (!deps) continue
    for (const [name, range] of Object.entries(deps)) {
      if (!workspaceNames.has(name)) continue
      if (typeof range !== 'string' || range.startsWith('workspace:')) continue
      if (range === next) continue
      changed.push(`${name}@${range}->${next}`)
      deps[name] = next
    }
  }
  return changed
}

console.log(`\nBumping ${current} -> ${next} (${bump})\n`)
for (const { path: file, json, name } of targets) {
  const from = json.version
  json.version = next
  const deps = pinWorkspaceDeps(json)
  const rel = path.relative(ROOT, file)
  console.log(`  ${(name ?? rel).padEnd(36)} ${from} -> ${next}`)
  for (const d of deps) console.log(`      dep ${d}`)
  writeJSON(file, json)
}
console.log(`\nDone. ${targets.length} package.json files updated.\n`)
console.log('Next: pnpm release')
