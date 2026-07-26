import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('packages/ui/src')
const forbidden = ['process.env', '@payloadcms/', '@tauri-apps/', '@capacitor/', 'electron', 'expo-', 'next/', 'FrogBot Pro', 'firmware.ai', 'frogbot.ai/assets']
const files = fs.readdirSync(root, { recursive: true }).filter((file) => /\.(?:ts|tsx|css)$/.test(file))

for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  for (const value of forbidden) assert.ok(!source.includes(value), `${file} contains ${value}`)
}

console.log(`[check-ui-architecture] ${files.length} source files passed.`)
