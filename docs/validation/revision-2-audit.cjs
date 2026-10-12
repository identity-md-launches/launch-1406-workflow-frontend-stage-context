// Independent checks of the final export, pinned implementation ABIs and handoff.
// From the repository root: node docs/validation/revision-2-audit.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '../..')
const { keccak256, toBytes } = createRequire(path.join(root, 'web/package.json'))('viem')
const read = p => fs.readFileSync(path.join(root, p))
const json = p => JSON.parse(read(p))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const handoff = json(fs.existsSync(path.join(root, '.imd/reads/deployment.json')) ? '.imd/reads/deployment.json' : 'web/deployment/deployment.json')
const network = json(fs.existsSync(path.join(root, '.imd/reads/network.json')) ? '.imd/reads/network.json' : 'web/deployment/network.json')
const manifest = json('dist/imd-deployment.json')
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
    : JSON.stringify(value)
const files = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
  assert(!entry.isSymbolicLink(), `No export symlinks: ${entry.name}`)
  const name = `${dir}/${entry.name}`
  return entry.isDirectory() ? files(name) : [name]
})

assert.deepEqual(Object.keys(manifest).sort(), ['version', 'launchId', 'chainId', 'sourceCommit', 'attestationHash', 'contracts', 'assets', 'poolKey', 'network', 'walletAddChain'].sort())
assert.equal(manifest.version, 1)
for (const key of ['launchId', 'chainId', 'sourceCommit', 'attestationHash', 'poolKey']) assert.deepEqual(manifest[key], handoff[key])
assert.deepEqual(manifest.network, network.network)
assert.deepEqual(manifest.walletAddChain, network.walletAddChain)
assert.deepEqual(manifest.contracts, handoff.contracts.map(({ name, address, abiHash }) => ({ name, address, abiHash, abiPath: `abi/${name}.json` })))
assert.deepEqual(json('web/deployment/deployment.json'), handoff)
assert.deepEqual(json('web/deployment/network.json'), network)

const abiResults = []
for (const name of [...handoff.contracts.map(c => c.name), 'SnitchReports']) {
  const sourcePath = `docs/abi/${name}.json`
  const pinned = execFileSync('git', ['show', `${handoff.sourceCommit}:${sourcePath}`], { cwd: root })
  assert.deepEqual(read(sourcePath), pinned)
  const abi = json(`dist/abi/${name}.json`)
  assert(Array.isArray(abi))
  assert.deepEqual(abi, JSON.parse(pinned))
  const abiHash = keccak256(toBytes(canonical(abi))).slice(2)
  const binding = handoff.contracts.find(c => c.name === name)
  if (binding) assert.equal(abiHash, binding.abiHash)
  abiResults.push({ name, matchesPinnedSource: true, abiHash, attested: Boolean(binding) })
}

const exported = files('dist').filter(p => p !== 'dist/imd-deployment.json').map(p => p.slice(5)).sort()
assert.deepEqual(manifest.assets.map(a => a.path).sort(), exported)
assert(manifest.assets.length <= 128)
let assetBytes = 0
for (const asset of manifest.assets) {
  assert(!asset.path.startsWith('/') && !asset.path.includes('..') && !asset.path.includes(':'))
  const bytes = read(`dist/${asset.path}`)
  assert(bytes.length <= 8388608)
  assert.match(asset.sha256, /^[a-f0-9]{64}$/)
  assert.equal(sha256(bytes), asset.sha256)
  assetBytes += bytes.length
}
assert(assetBytes < 32 * 1024 * 1024)
const image = read('dist/share-card.png')
assert.deepEqual(image, read('web/public/share-card.png'))
assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
assert.equal(image.readUInt32BE(16), 1200)
assert.equal(image.readUInt32BE(20), 630)
const html = read('dist/index.html').toString()
for (const text of ['property="og:image" content="./share-card.png"', 'name="twitter:image" content="./share-card.png"', 'name="twitter:card" content="summary_large_image"']) assert(html.includes(text))

const result = { passed: true, sourceCommit: handoff.sourceCommit, abis: abiResults, handoffBinding: 'exact', assets: manifest.assets.length, assetBytes, manifestBytes: read('dist/imd-deployment.json').length, shareImage: { width: 1200, height: 630, bytes: image.length, sha256: sha256(image) }, externalTransactions: 0 }
console.log(JSON.stringify(result, null, 2))
