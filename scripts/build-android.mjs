#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const env = { ...process.env }

if (args.includes('--debug')) {
  throw new Error(
    'android:build produces signed release APKs. Use npm run tauri -- android build --debug for debug builds.',
  )
}

// Gradle consumes environment variables; this file is only the local credential adapter.
if (!env.ANDROID_KEYSTORE_PATH) {
  const configPath =
    env.OPENCODE_ANDROID_SIGNING_CONFIG ?? resolve(homedir(), 'Documents/OpenCodeUI-signing/signing.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  env.ANDROID_KEYSTORE_PATH = config.keystorePath
  env.ANDROID_KEY_ALIAS = config.keyAlias
  env.ANDROID_KEY_PASSWORD = config.password
}

for (const name of ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) {
  if (typeof env[name] !== 'string' || !env[name].trim()) {
    throw new Error(`Missing ${name} signing credential`)
  }
}
if (!existsSync(env.ANDROID_KEYSTORE_PATH)) {
  throw new Error('Android release keystore does not exist')
}

const result = spawnSync(
  process.execPath,
  [resolve(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'android', 'build', '--apk', '--ci', ...args],
  { cwd: root, env, stdio: 'inherit' },
)
if (result.error) throw result.error
process.exit(result.status ?? 1)
