#!/usr/bin/env node
// Emits dist/imd-deployment.json after `vite build`.
//
// Inputs (first existing path wins):
//   handoff:  --handoff <path>  | ../.imd/reads/deployment.json | ./deployment/deployment.json
//   network:  --network <path>  | ../.imd/reads/network.json    | ./deployment/network.json
//   ABIs:     ../docs/abi/<Contract>.json (implementation-derived, at the pinned source commit)
//
// Steps: verify every handoff abiHash = keccak256(canonical JSON of the ABI), copy the ABIs into
// dist/abi/, enumerate every exported file except the manifest, hash each with SHA-256, and write
// the manifest with exactly the allowed top-level keys.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { keccak256, toBytes } from 'viem'

const here = dirname(fileURLToPath(import.meta.url))
const webDir = resolve(here, '..')
const repoDir = resolve(webDir, '..')
const distDir = resolve(repoDir, 'dist')
const abiSourceDir = resolve(repoDir, 'docs', 'abi')

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function firstExisting(paths) {
  for (const p of paths) if (p && existsSync(p)) return p
  return undefined
}

const handoffPath = firstExisting([
  arg('handoff'),
  resolve(repoDir, '.imd', 'reads', 'deployment.json'),
  resolve(webDir, 'deployment', 'deployment.json'),
])
const networkPath = firstExisting([
  arg('network'),
  resolve(repoDir, '.imd', 'reads', 'network.json'),
  resolve(webDir, 'deployment', 'network.json'),
])
if (!handoffPath) throw new Error('No deployment handoff found')
if (!existsSync(join(distDir, 'index.html'))) throw new Error('dist/index.html missing: run vite build first')

const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'))
const networkFile = networkPath ? JSON.parse(readFileSync(networkPath, 'utf8')) : undefined

// Canonical JSON: sorted keys, no whitespace (what the handoff's abiHash is computed over).
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
const abiHashOf = (abi) => keccak256(toBytes(canonical(abi))).slice(2)
const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex')

// 1. ABIs: the handoff contracts, verified, plus SnitchReports (deployed by the desk, address read on chain).
const abiDir = join(distDir, 'abi')
rmSync(abiDir, { recursive: true, force: true })
mkdirSync(abiDir, { recursive: true })
const contracts = []
for (const c of handoff.contracts) {
  const abi = JSON.parse(readFileSync(join(abiSourceDir, `${c.name}.json`), 'utf8'))
  const hash = abiHashOf(abi)
  if (hash !== c.abiHash) throw new Error(`ABI hash mismatch for ${c.name}: ${hash} != ${c.abiHash}`)
  writeFileSync(join(abiDir, `${c.name}.json`), JSON.stringify(abi))
  contracts.push({ name: c.name, address: c.address, abiHash: c.abiHash, abiPath: `abi/${c.name}.json` })
}
for (const extra of ['SnitchReports']) {
  const abi = JSON.parse(readFileSync(join(abiSourceDir, `${extra}.json`), 'utf8'))
  writeFileSync(join(abiDir, `${extra}.json`), JSON.stringify(abi))
}

// 2. Assets: every file under dist/ except the manifest itself.
const manifestName = 'imd-deployment.json'
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}
const assets = walk(distDir)
  .map((full) => relative(distDir, full).split(sep).join('/'))
  .filter((p) => p !== manifestName)
  .sort()
  .map((path) => {
    const bytes = readFileSync(join(distDir, path))
    if (bytes.length > 8 * 1024 * 1024) throw new Error(`${path} exceeds 8 MiB`)
    return { path, sha256: sha256Of(bytes) }
  })
if (assets.length > 128) throw new Error(`${assets.length} assets exceed the 128 limit`)
if (!assets.some((a) => a.path === 'index.html')) throw new Error('index.html not exported')

// 3. The manifest, in the exact key set the publication check accepts.
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets,
}
if (handoff.poolKey) {
  const { currency0, currency1, fee, tickSpacing, hooks } = handoff.poolKey
  manifest.poolKey = { currency0, currency1, fee, tickSpacing, hooks }
}
if (networkFile?.network) manifest.network = networkFile.network
if (networkFile?.walletAddChain) manifest.walletAddChain = networkFile.walletAddChain

writeFileSync(join(distDir, manifestName), JSON.stringify(manifest, null, 2) + '\n')
const total = assets.reduce((n, a) => n + statSync(join(distDir, a.path)).size, 0)
console.log(`wrote dist/${manifestName}: ${contracts.length} contracts, ${assets.length} assets, ${(total / 1024).toFixed(1)} KiB`)
